from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
            select(Person).where(Person.id == person_id)
        )
        person = result.scalar_one_or_none()
        if not person:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

        if user.role != UserRole.ADMIN:
            access_result = await self.db.execute(
                select(ProfilePerson.id)
                .join(Profile, ProfilePerson.profile_id == Profile.id)
                .where(
                    ProfilePerson.person_id == person.id,
                    Profile.owner_user_id == user.id,
                )
                .limit(1)
            )
            if access_result.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied",
                )

        return person

    async def _get_fact_with_access(self, fact_id: UUID, user: User) -> Fact:
        fact = await self.repo.get_by_id(fact_id)
        if not fact:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fact not found")
        await self._get_person_with_access(fact.person_id, user)
        return fact

    async def create(self, person_id: UUID, data: FactCreate, user: User) -> Fact:
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

        # auto-stamp verification when a genealogist/admin sets CONFIRMED
        if updates.get("confidence") == FactConfidence.CONFIRMED:
            if user.role in (UserRole.GENEALOGIST, UserRole.ADMIN):
                updates["verified_by_user_id"] = user.id
                updates["verified_at"] = datetime.now(UTC)

        return await self.repo.update(fact, **updates)

    async def delete(self, fact_id: UUID, user: User) -> None:
        fact = await self._get_fact_with_access(fact_id, user)
        await self.repo.delete(fact)
