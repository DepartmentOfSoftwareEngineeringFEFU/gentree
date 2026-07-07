from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.archive_request import ArchiveRequest
from app.models.document import ArchiveRequestDocument
from app.models.enums import ArchiveRequestStatus, UserRole, UserStatus
from app.models.user import User
from app.modules.archive_requests.schemas import (
    ArchiveRequestCreate,
    ArchiveRequestUpdate,
    StatusChangeRequest,
)
from app.repositories.archive_request import ArchiveRequestRepository
from app.repositories.profile import ProfileRepository
from app.repositories.user import UserRepository

# allowed status transitions
_TRANSITIONS: dict[ArchiveRequestStatus, set[ArchiveRequestStatus]] = {
    ArchiveRequestStatus.DRAFT: {ArchiveRequestStatus.PREPARED},
    ArchiveRequestStatus.PREPARED: {ArchiveRequestStatus.SENT},
    ArchiveRequestStatus.SENT: {ArchiveRequestStatus.IN_PROGRESS},
    ArchiveRequestStatus.IN_PROGRESS: {ArchiveRequestStatus.RESPONSE_RECEIVED},
    ArchiveRequestStatus.NEEDS_CLARIFICATION: {ArchiveRequestStatus.IN_PROGRESS},
    ArchiveRequestStatus.RESPONSE_RECEIVED: {ArchiveRequestStatus.COMPLETED},
    ArchiveRequestStatus.COMPLETED: set(),
    ArchiveRequestStatus.CANCELLED: set(),
}

_CLARIFICATION_ALLOWED_FROM = {
    ArchiveRequestStatus.PREPARED,
    ArchiveRequestStatus.SENT,
    ArchiveRequestStatus.IN_PROGRESS,
    ArchiveRequestStatus.RESPONSE_RECEIVED,
}


class ArchiveRequestService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = ArchiveRequestRepository(db)
        self.profile_repo = ProfileRepository(db)
        self.user_repo = UserRepository(db)
        self.db = db

    async def _get_profile_owner(self, profile_id: UUID) -> UUID:
        profile = await self.profile_repo.get_by_id(profile_id)
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
        return profile.owner_user_id

    async def _get_request_with_access(
        self, request_id: UUID, user: User
    ) -> ArchiveRequest:
        req = await self.repo.get_by_id(request_id)
        if not req:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Archive request not found"
            )
        if user.role == UserRole.ADMIN:
            return req
        if user.role == UserRole.GENEALOGIST:
            if req.assigned_genealogist_user_id != user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
            return req
        if req.created_by_user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return req

    async def create(
        self, profile_id: UUID, data: ArchiveRequestCreate, user: User
    ) -> ArchiveRequest:
        owner_id = await self._get_profile_owner(profile_id)
        if user.role == UserRole.USER and owner_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return await self.repo.create(
            profile_id=profile_id,
            created_by_user_id=user.id,
            current_status=ArchiveRequestStatus.PREPARED,
            **data.model_dump(),
        )

    async def get_by_id(self, request_id: UUID, user: User) -> ArchiveRequest:
        return await self._get_request_with_access(request_id, user)

    async def list_by_profile(self, profile_id: UUID, user: User) -> list[ArchiveRequest]:
        await self._get_profile_owner(profile_id)  # check profile exists
        if user.role == UserRole.ADMIN:
            return await self.repo.get_by_profile(profile_id)
        return [
            r for r in await self.repo.get_by_profile(profile_id)
            if r.created_by_user_id == user.id
            or r.assigned_genealogist_user_id == user.id
        ]

    async def list_assigned_to_me(self, user: User) -> list[ArchiveRequest]:
        if user.role != UserRole.GENEALOGIST:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Genealogist only",
            )
        return await self.repo.get_by_assignee(user.id)

    async def list_unassigned(self, user: User) -> list[ArchiveRequest]:
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
        return await self.repo.get_unassigned()

    async def list_all(self, user: User) -> list[ArchiveRequest]:
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
        return await self.repo.get_all()

    async def update(
        self, request_id: UUID, data: ArchiveRequestUpdate, user: User
    ) -> ArchiveRequest:
        req = await self._get_request_with_access(request_id, user)
        updates = data.model_dump(exclude_none=True)
        if not updates:
            return req
        if req.current_status in (ArchiveRequestStatus.COMPLETED, ArchiveRequestStatus.CANCELLED):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Completed or cancelled requests cannot be edited",
            )
        result_fields = {
            "processing_comment",
            "result_summary",
            "found_information",
            "result_sources",
            "result_recommendations",
            "result_status",
            "result_persons",
            "result_facts",
            "result_relationships",
            "result_document_links",
        }
        if result_fields & updates.keys():
            if user.role != UserRole.GENEALOGIST or req.assigned_genealogist_user_id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only assigned genealogist can update processing result",
                )
        return await self.repo.update(req, **updates)

    async def change_status(
        self, request_id: UUID, body: StatusChangeRequest, user: User
    ) -> tuple[ArchiveRequest, bool]:
        """Returns (updated_request, notify_owner)."""
        req = await self._get_request_with_access(request_id, user)
        if user.role != UserRole.GENEALOGIST or req.assigned_genealogist_user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only assigned genealogist can change request status",
            )
        allowed = _TRANSITIONS.get(req.current_status, set())
        if body.new_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cannot transition from {req.current_status} to {body.new_status}",
            )
        if body.new_status == ArchiveRequestStatus.COMPLETED:
            await self._assert_can_complete(req)
        updated = await self.repo.change_status(
            req, body.new_status, user.id, body.comment
        )
        notify_owner = user.id != req.created_by_user_id
        return updated, notify_owner

    async def _assert_can_complete(self, req: ArchiveRequest) -> None:
        has_result_text = any(
            (value or "").strip()
            for value in (req.result_summary, req.found_information)
        )
        has_structured_findings = any(
            getattr(req, field, None)
            for field in ("result_persons", "result_facts", "result_relationships")
        )
        if not req.result_status or (not has_result_text and not has_structured_findings):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Перед завершением укажите результат обработки и найденные сведения.",
            )

        result_docs = await self.db.execute(
            select(ArchiveRequestDocument.id).where(
                ArchiveRequestDocument.archive_request_id == req.id,
                ArchiveRequestDocument.relation_type == "GENEALOGIST_RESULT",
            )
        )
        has_result_docs = result_docs.scalars().first() is not None
        has_source_note = any(
            (value or "").strip()
            for value in (req.result_sources, req.processing_comment)
        )
        if not has_result_docs and not has_source_note:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Перед завершением загрузите найденные документы или поясните, "
                    "почему документы не приложены."
                ),
            )

    async def request_clarification(
        self, request_id: UUID, comment: str, user: User
    ) -> ArchiveRequest:
        req = await self._get_request_with_access(request_id, user)
        if user.role != UserRole.GENEALOGIST or req.assigned_genealogist_user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only assigned genealogist can request clarification",
            )
        if req.current_status not in _CLARIFICATION_ALLOWED_FROM:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cannot request clarification from {req.current_status}",
            )
        return await self.repo.change_status(
            req,
            ArchiveRequestStatus.NEEDS_CLARIFICATION,
            user.id,
            comment,
        )

    async def provide_clarification(
        self, request_id: UUID, comment: str | None, user: User
    ) -> ArchiveRequest:
        req = await self._get_request_with_access(request_id, user)
        if user.role != UserRole.USER or req.created_by_user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only request owner can provide clarification",
            )
        if req.current_status != ArchiveRequestStatus.NEEDS_CLARIFICATION:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Request does not need clarification",
            )
        return await self.repo.change_status(
            req,
            ArchiveRequestStatus.IN_PROGRESS,
            user.id,
            comment or "Пользователь предоставил дополнительные сведения",
        )

    async def assign(self, request_id: UUID, genealogist_id: UUID, user: User) -> ArchiveRequest:
        if user.role not in (UserRole.ADMIN,):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
        req = await self.repo.get_by_id(request_id)
        if not req:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Archive request not found"
            )
        genealogist = await self.user_repo.get_by_id(genealogist_id)
        if (
            not genealogist
            or genealogist.role != UserRole.GENEALOGIST
            or genealogist.status != UserStatus.ACTIVE
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Assignee must be an active genealogist",
            )
        return await self.repo.update(req, assigned_genealogist_user_id=genealogist_id)

    async def get_history(self, request_id: UUID, user: User):
        await self._get_request_with_access(request_id, user)
        return await self.repo.get_status_history(request_id)
