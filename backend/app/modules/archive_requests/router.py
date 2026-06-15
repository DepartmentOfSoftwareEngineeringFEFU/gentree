from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.enums import NotificationType
from app.modules.archive_requests.schemas import (
    ArchiveRequestCreate,
    ArchiveRequestRead,
    ArchiveRequestUpdate,
    AssigneeRequest,
    ClarificationRequest,
    ClarificationResponse,
    StatusChangeRequest,
    StatusHistoryRead,
)
from app.modules.archive_requests.service import ArchiveRequestService
from app.modules.auth.dependencies import get_current_user
from app.modules.notifications.service import NotificationService

router = APIRouter(tags=["archive_requests"])


@router.post(
    "/profiles/{profile_id}/archive-requests",
    response_model=ArchiveRequestRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_archive_request(
    profile_id: UUID,
    data: ArchiveRequestCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveRequestRead:
    req = await ArchiveRequestService(db).create(profile_id, data, current_user)
    return ArchiveRequestRead.model_validate(req)


@router.get("/profiles/{profile_id}/archive-requests", response_model=list[ArchiveRequestRead])
async def list_archive_requests(
    profile_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[ArchiveRequestRead]:
    reqs = await ArchiveRequestService(db).list_by_profile(profile_id, current_user)
    return [ArchiveRequestRead.model_validate(r) for r in reqs]


@router.get("/archive-requests/assigned/me", response_model=list[ArchiveRequestRead])
async def list_my_assigned_archive_requests(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[ArchiveRequestRead]:
    reqs = await ArchiveRequestService(db).list_assigned_to_me(current_user)
    return [ArchiveRequestRead.model_validate(r) for r in reqs]


@router.get("/archive-requests/unassigned", response_model=list[ArchiveRequestRead])
async def list_unassigned_archive_requests(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[ArchiveRequestRead]:
    reqs = await ArchiveRequestService(db).list_unassigned(current_user)
    return [ArchiveRequestRead.model_validate(r) for r in reqs]


@router.get("/archive-requests", response_model=list[ArchiveRequestRead])
async def list_all_archive_requests(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[ArchiveRequestRead]:
    reqs = await ArchiveRequestService(db).list_all(current_user)
    return [ArchiveRequestRead.model_validate(r) for r in reqs]


@router.get("/archive-requests/{request_id}", response_model=ArchiveRequestRead)
async def get_archive_request(
    request_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveRequestRead:
    req = await ArchiveRequestService(db).get_by_id(request_id, current_user)
    return ArchiveRequestRead.model_validate(req)


@router.patch("/archive-requests/{request_id}", response_model=ArchiveRequestRead)
async def update_archive_request(
    request_id: UUID,
    data: ArchiveRequestUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveRequestRead:
    req = await ArchiveRequestService(db).update(request_id, data, current_user)
    return ArchiveRequestRead.model_validate(req)


@router.patch("/archive-requests/{request_id}/status", response_model=ArchiveRequestRead)
async def change_status(
    request_id: UUID,
    body: StatusChangeRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveRequestRead:
    svc = ArchiveRequestService(db)
    req, notify_owner = await svc.change_status(request_id, body, current_user)

    if notify_owner:
        await NotificationService(db).send(
            recipient_user_id=req.created_by_user_id,
            notification_type=NotificationType.REQUEST_STATUS_CHANGED,
            title=f"Статус запроса изменён: {req.current_status.value}",
            body=body.comment or f"Запрос «{req.title}» переведён в статус {req.current_status.value}.",
            related_archive_request_id=req.id,
        )

    return ArchiveRequestRead.model_validate(req)


@router.post(
    "/archive-requests/{request_id}/request-clarification",
    response_model=ArchiveRequestRead,
)
async def request_clarification(
    request_id: UUID,
    body: ClarificationRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveRequestRead:
    req = await ArchiveRequestService(db).request_clarification(
        request_id, body.comment, current_user
    )
    await NotificationService(db).send(
        recipient_user_id=req.created_by_user_id,
        notification_type=NotificationType.REQUEST_NEEDS_CLARIFICATION,
        title="Требуются дополнительные сведения",
        body=body.comment,
        related_archive_request_id=req.id,
    )
    return ArchiveRequestRead.model_validate(req)


@router.post(
    "/archive-requests/{request_id}/provide-clarification",
    response_model=ArchiveRequestRead,
)
async def provide_clarification(
    request_id: UUID,
    body: ClarificationResponse,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveRequestRead:
    req = await ArchiveRequestService(db).provide_clarification(
        request_id, body.comment, current_user
    )
    if req.assigned_genealogist_user_id:
        await NotificationService(db).send(
            recipient_user_id=req.assigned_genealogist_user_id,
            notification_type=NotificationType.REQUEST_STATUS_CHANGED,
            title="Пользователь предоставил дополнительные сведения",
            body=body.comment or f"По запросу «{req.title}» переданы дополнительные сведения.",
            related_archive_request_id=req.id,
        )
    return ArchiveRequestRead.model_validate(req)


@router.patch("/archive-requests/{request_id}/assignee", response_model=ArchiveRequestRead)
async def assign_genealogist(
    request_id: UUID,
    body: AssigneeRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveRequestRead:
    req = await ArchiveRequestService(db).assign(request_id, body.genealogist_user_id, current_user)
    await NotificationService(db).send(
        recipient_user_id=body.genealogist_user_id,
        notification_type=NotificationType.REQUEST_ASSIGNED,
        title="Назначен архивный запрос",
        body=f"Вам назначен запрос «{req.title}».",
        related_archive_request_id=req.id,
    )
    return ArchiveRequestRead.model_validate(req)


@router.get(
    "/archive-requests/{request_id}/history",
    response_model=list[StatusHistoryRead],
)
async def get_status_history(
    request_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[StatusHistoryRead]:
    history = await ArchiveRequestService(db).get_history(request_id, current_user)
    return [StatusHistoryRead.model_validate(h) for h in history]
