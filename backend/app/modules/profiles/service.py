from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.archive_request import ArchiveRequest
from app.models.enums import UserRole
from app.models.profile import Profile
from app.models.user import User
from app.modules.profiles.schemas import ProfileCreate, ProfileUpdate
from app.repositories.profile import ProfileRepository


class ProfileService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = ProfileRepository(db)
        self.db = db

    async def create(self, data: ProfileCreate, owner: User) -> Profile:
        return await self.repo.create(
            owner_user_id=owner.id,
            title=data.title,
            description=data.description,
        )

    async def get_my(self, current_user: User) -> list[Profile]:
        return await self.repo.get_by_owner(current_user.id)

    async def get_by_id(self, profile_id: UUID, current_user: User) -> Profile:
        profile = await self.repo.get_by_id(profile_id)
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
        await self._check_access(profile, current_user)
        return profile

    async def update(self, profile_id: UUID, data: ProfileUpdate, current_user: User) -> Profile:
        if current_user.role == UserRole.GENEALOGIST:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        profile = await self.get_by_id(profile_id, current_user)
        updates = data.model_dump(exclude_none=True)
        if not updates:
            return profile
        return await self.repo.update(profile, **updates)

    async def _check_access(self, profile: Profile, user: User) -> None:
        if user.role == UserRole.ADMIN:
            return
        if profile.owner_user_id == user.id:
            return
        if user.role == UserRole.GENEALOGIST:
            result = await self.db.execute(
                select(ArchiveRequest.id).where(
                    ArchiveRequest.profile_id == profile.id,
                    ArchiveRequest.assigned_genealogist_user_id == user.id,
                )
            )
            if result.scalars().first() is not None:
                return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
