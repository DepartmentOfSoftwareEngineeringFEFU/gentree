from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.archive_request import ArchiveRequest
from app.models.enums import UserRole
from app.models.profile import Person, Profile, ProfilePerson
from app.models.user import User
from app.modules.persons.schemas import PersonCreate, PersonUpdate
from app.repositories.person import PersonRepository
from app.repositories.profile import ProfileRepository


class PersonService:
    def __init__(self, db: AsyncSession) -> None:
        self.person_repo = PersonRepository(db)
        self.profile_repo = ProfileRepository(db)
        self.db = db

    async def _assert_profile_access(self, profile_id: UUID, user: User) -> None:
        profile = await self.profile_repo.get_by_id(profile_id)
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
        if user.role == UserRole.ADMIN or profile.owner_user_id == user.id:
            return
        if user.role == UserRole.GENEALOGIST:
            result = await self.db.execute(
                select(ArchiveRequest.id).where(
                    ArchiveRequest.profile_id == profile_id,
                    ArchiveRequest.assigned_genealogist_user_id == user.id,
                )
            )
            if result.scalars().first() is not None:
                return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    async def _assert_person_access(self, person: Person, user: User) -> None:
        if user.role == UserRole.ADMIN:
            return
        owner_result = await self.db.execute(
            select(Profile)
            .join(ProfilePerson, ProfilePerson.profile_id == Profile.id)
            .where(
                ProfilePerson.person_id == person.id,
                Profile.owner_user_id == user.id,
            )
        )
        if owner_result.scalars().first() is not None:
            return
        if user.role == UserRole.GENEALOGIST:
            assigned_result = await self.db.execute(
                select(ArchiveRequest.id)
                .join(ProfilePerson, ProfilePerson.profile_id == ArchiveRequest.profile_id)
                .where(
                    ProfilePerson.person_id == person.id,
                    ArchiveRequest.assigned_genealogist_user_id == user.id,
                )
            )
            if assigned_result.scalars().first() is not None:
                return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    async def _get_person_with_access(self, person_id: UUID, user: User) -> Person:
        person = await self.person_repo.get_by_id(person_id)
        if not person:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
        await self._assert_person_access(person, user)
        return person

    async def create(self, profile_id: UUID, data: PersonCreate, user: User) -> Person:
        if user.role == UserRole.GENEALOGIST:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        await self._assert_profile_access(profile_id, user)
        return await self.person_repo.create(profile_id=profile_id, **data.model_dump())

    async def list_by_profile(self, profile_id: UUID, user: User) -> list[Person]:
        await self._assert_profile_access(profile_id, user)
        return await self.person_repo.get_by_profile(profile_id)

    async def get_by_id(self, person_id: UUID, user: User) -> Person:
        return await self._get_person_with_access(person_id, user)

    async def update(self, person_id: UUID, data: PersonUpdate, user: User) -> Person:
        if user.role == UserRole.GENEALOGIST:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        person = await self._get_person_with_access(person_id, user)
        updates = data.model_dump(exclude_none=True)
        if not updates:
            return person
        return await self.person_repo.update(person, **updates)

    async def delete(self, person_id: UUID, user: User) -> None:
        if user.role == UserRole.GENEALOGIST:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        person = await self._get_person_with_access(person_id, user)
        await self.person_repo.delete(person)
