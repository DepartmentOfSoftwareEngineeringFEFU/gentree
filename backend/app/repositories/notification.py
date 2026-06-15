from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.repositories.base import SQLAlchemyRepository


class NotificationRepository(SQLAlchemyRepository[Notification]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Notification)

    async def get_by_user(self, user_id: UUID, unread_only: bool = False) -> list[Notification]:
        q = select(Notification).where(Notification.recipient_user_id == user_id)
        if unread_only:
            q = q.where(Notification.read_at.is_(None))
        q = q.order_by(Notification.created_at.desc())
        result = await self.session.execute(q)
        return list(result.scalars().all())

    async def get_by_id(self, notification_id: UUID) -> Notification | None:
        result = await self.session.execute(
            select(Notification).where(Notification.id == notification_id)
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: object) -> Notification:
        n = Notification(**kwargs)
        self.session.add(n)
        await self.session.commit()
        await self.session.refresh(n)
        return n

    async def mark_read(self, notification: Notification) -> Notification:
        from datetime import datetime, timezone
        notification.read_at = datetime.now(timezone.utc)
        await self.session.commit()
        await self.session.refresh(notification)
        return notification

    async def mark_all_read(self, user_id: UUID) -> int:
        from datetime import datetime, timezone
        result = await self.session.execute(
            update(Notification)
            .where(Notification.recipient_user_id == user_id, Notification.read_at.is_(None))
            .values(read_at=datetime.now(timezone.utc))
        )
        await self.session.commit()
        return result.rowcount or 0

    async def count_unread(self, user_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count()).select_from(Notification).where(
                Notification.recipient_user_id == user_id,
                Notification.read_at.is_(None),
            )
        )
        return int(result.scalar_one())
