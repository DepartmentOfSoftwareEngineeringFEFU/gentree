from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import NotificationType
from app.models.notification import Notification
from app.models.user import User
from app.repositories.notification import NotificationRepository


class NotificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = NotificationRepository(db)

    async def list_for_user(
        self, user: User, unread_only: bool = False
    ) -> list[Notification]:
        return await self.repo.get_by_user(user.id, unread_only=unread_only)

    async def count_unread(self, user: User) -> int:
        return await self.repo.count_unread(user.id)

    async def mark_read(self, notification_id: UUID, user: User) -> Notification:
        n = await self.repo.get_by_id(notification_id)
        if not n:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
            )
        if n.recipient_user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return await self.repo.mark_read(n)

    async def mark_all_read(self, user: User) -> int:
        return await self.repo.mark_all_read(user.id)

    async def send(
        self,
        recipient_user_id: UUID,
        notification_type: NotificationType,
        title: str,
        body: str,
        related_archive_request_id: UUID | None = None,
    ) -> Notification:
        return await self.repo.create(
            recipient_user_id=recipient_user_id,
            notification_type=notification_type,
            title=title,
            body=body,
            related_archive_request_id=related_archive_request_id,
        )
