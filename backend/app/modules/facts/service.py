from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.archive_request import ArchiveRequest
from app.models.enums import FactConfidence, UserRole
from app.models.fact import Fact
from app.models.profile import Person, Profile, ProfilePerson
from app.models.user import User
from app.modules.facts.schemas import FactCreate, FactUpdate
from app.repositories.fact import FactRepository


class FactService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = FactRepository(db)
        self.db = db

    async def _get_person_with_access(self, person_id: UUID, user: User) -> Person:
        result = await self.db.execute(
            select(Person)
            .join(ProfilePerson, ProfilePerson.person_id == Person.id)
            .join(Profile, ProfilePerson.profile_id == Profile.id)
            .where(Person.id == person_id)
        )
        person = result.scalars().first()
        if not person:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

        profile_result = await self.db.execute(
            select(Profile)
            .join(ProfilePerson, ProfilePerson.profile_id == Profile.id)
            .where(ProfilePerson.person_id == person.id)
        )
        profiles = list(profile_result.scalars().all())
        if user.role == UserRole.ADMIN:
            return person
        if any(p.owner_user_id == user.id for p in profiles):
            return person
        if user.role == UserRole.GENEALOGIST:
            profile_ids = [p.id for p in profiles]
            assigned_result = await self.db.execute(
                select(ArchiveRequest.id).where(
                    ArchiveRequest.profile_id.in_(profile_ids),
                    ArchiveRequest.assigned_genealogist_user_id == user.id,
                )
            )
            if assigned_result.scalars().first() is not None:
                return person

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    async def _get_fact_with_access(self, fact_id: UUID, user: User) -> Fact:
        fact = await self.repo.get_by_id(fact_id)
        if not fact:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fact not found")
        await self._get_person_with_access(fact.person_id, user)
        return fact

    async def create(self, person_id: UUID, data: FactCreate, user: User) -> Fact:
        if user.role == UserRole.GENEALOGIST:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        await self._get_person_with_access(person_id, user)
        return await self.repo.create(person_id=person_id, **data.model_dump())

    async def list_by_person(self, person_id: UUID, user: User) -> list[Fact]:
        await self._get_person_with_access(person_id, user)
        return await self.repo.get_by_person(person_id)

    async def update(self, fact_id: UUID, data: FactUpdate, user: User) -> Fact:
        fact = await self._get_fact_with_access(fact_id, user)
        updates = data.model_dump(exclude_none=True)
        if not updates:
            return fact
        if user.role == UserRole.GENEALOGIST and set(updates) != {"confidence"}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Genealogist can update only fact confidence",
            )

        # auto-stamp verification when a genealogist/admin sets CONFIRMED
        if updates.get("confidence") == FactConfidence.CONFIRMED:
            if user.role in (UserRole.GENEALOGIST, UserRole.ADMIN):
                updates["verified_by_user_id"] = user.id
                updates["verified_at"] = datetime.now(timezone.utc)

        return await self.repo.update(fact, **updates)

    async def delete(self, fact_id: UUID, user: User) -> None:
        if user.role == UserRole.GENEALOGIST:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        fact = await self._get_fact_with_access(fact_id, user)
        await self.repo.delete(fact)
