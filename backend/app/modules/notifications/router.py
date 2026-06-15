from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.auth.dependencies import get_current_user
from app.modules.notifications.schemas import NotificationRead, UnreadCountRead
from app.modules.notifications.service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    unread_only: bool = Query(False),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[NotificationRead]:
    notifications = await NotificationService(db).list_for_user(current_user, unread_only)
    return [NotificationRead.model_validate(n) for n in notifications]


@router.get("/unread-count", response_model=UnreadCountRead)
async def unread_count(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> UnreadCountRead:
    count = await NotificationService(db).count_unread(current_user)
    return UnreadCountRead(count=count)


@router.patch("/read-all", response_model=UnreadCountRead)
async def mark_all_read(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> UnreadCountRead:
    await NotificationService(db).mark_all_read(current_user)
    return UnreadCountRead(count=0)


@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(
    notification_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> NotificationRead:
    n = await NotificationService(db).mark_read(notification_id, current_user)
    return NotificationRead.model_validate(n)
