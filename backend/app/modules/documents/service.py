from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import delete_file, save_upload
from app.models.archive_request import ArchiveRequest
from app.models.document import Document
from app.models.enums import ArchiveRequestStatus, DocumentKind, DocumentSourceType, UserRole
from app.models.user import User
from app.repositories.document import DocumentRepository


class DocumentService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = DocumentRepository(db)
        self.db = db

    async def _get_archive_request_with_access(
        self, archive_request_id: UUID, user: User
    ) -> ArchiveRequest:
        from app.modules.archive_requests.service import ArchiveRequestService

        return await ArchiveRequestService(self.db).get_by_id(archive_request_id, user)

    async def upload(
        self,
        file: UploadFile,
        document_kind: DocumentKind,
        user: User,
        archive_request_id: UUID | None = None,
        person_id: UUID | None = None,
    ) -> Document:
        archive_relation_type = "ATTACHMENT"
        source_type = DocumentSourceType.USER_UPLOAD

        if archive_request_id:
            req = await self._get_archive_request_with_access(archive_request_id, user)
            if req.current_status in (
                ArchiveRequestStatus.COMPLETED,
                ArchiveRequestStatus.CANCELLED,
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Cannot upload documents to completed or cancelled request",
                )
            if user.role == UserRole.GENEALOGIST:
                if req.assigned_genealogist_user_id != user.id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
                    )
                document_kind = DocumentKind.ARCHIVE_SCAN
                source_type = DocumentSourceType.GENEALOGIST_UPLOAD
                archive_relation_type = "GENEALOGIST_RESULT"
            elif user.role == UserRole.USER:
                if req.created_by_user_id != user.id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
                    )
                document_kind = DocumentKind.ATTACHMENT
                source_type = DocumentSourceType.USER_UPLOAD
                archive_relation_type = "USER_ATTACHMENT"
            elif user.role != UserRole.ADMIN:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        storage_path, sha256, size = await save_upload(file)

        doc = await self.repo.create(
            uploaded_by_user_id=user.id,
            document_kind=document_kind,
            source_type=source_type,
            file_name=file.filename or Path(storage_path).name,
            mime_type=file.content_type or "application/octet-stream",
            file_size_bytes=size,
            storage_path=storage_path,
            checksum_sha256=sha256,
        )

        if archive_request_id:
            await self.repo.link_to_archive_request(
                doc.id, archive_request_id, archive_relation_type
            )
        if person_id:
            await self.repo.link_to_person(doc.id, person_id)

        return await self.repo.commit_and_refresh(doc)

    async def get_by_id(self, document_id: UUID, user: User) -> Document:
        doc = await self.repo.get_by_id(document_id)
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        await self._assert_document_access(doc, user)
        return doc

    async def _assert_document_access(self, doc: Document, user: User) -> None:
        if user.role == UserRole.ADMIN or doc.uploaded_by_user_id == user.id:
            return
        archive_request_ids = await self.repo.get_archive_request_ids(doc.id)
        for archive_request_id in archive_request_ids:
            try:
                await self._get_archive_request_with_access(archive_request_id, user)
                return
            except HTTPException as exc:
                if exc.status_code != status.HTTP_403_FORBIDDEN:
                    raise
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    async def get_by_archive_request(
        self, archive_request_id: UUID, user: User
    ) -> list[Document]:
        await self._get_archive_request_with_access(archive_request_id, user)
        return await self.repo.get_by_archive_request(archive_request_id)

    async def get_by_person(self, person_id: UUID, user: User) -> list[Document]:
        return await self.repo.get_by_person(person_id)

    async def delete(self, document_id: UUID, user: User) -> None:
        doc = await self.get_by_id(document_id, user)
        archive_request_ids = await self.repo.get_archive_request_ids(doc.id)
        for archive_request_id in archive_request_ids:
            req = await self._get_archive_request_with_access(archive_request_id, user)
            if req.current_status in (
                ArchiveRequestStatus.COMPLETED,
                ArchiveRequestStatus.CANCELLED,
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Cannot delete documents from completed or cancelled request",
                )
        if user.role == UserRole.USER and (
            doc.uploaded_by_user_id != user.id
            or doc.source_type != DocumentSourceType.USER_UPLOAD
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        is_genealogist_result = (
            doc.source_type == DocumentSourceType.GENEALOGIST_UPLOAD
            or doc.document_kind == DocumentKind.ARCHIVE_SCAN
        )
        if user.role == UserRole.GENEALOGIST and (
            doc.uploaded_by_user_id != user.id or not is_genealogist_result
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        delete_file(doc.storage_path)
        await self.repo.delete(doc)

    def get_file_path(self, doc: Document) -> str:
        if not Path(doc.storage_path).exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk"
            )
        return doc.storage_path
