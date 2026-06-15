from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.archive_request import ArchiveRequest
from app.models.enums import RelationshipType, UserRole
from app.models.profile import Person, ProfilePerson, Relationship
from app.models.user import User
from app.modules.relationships.schemas import (
    RelationshipCreate,
    RelationshipUpdate,
    TreeNode,
    TreeResponse,
)
from app.repositories.profile import ProfileRepository
from app.repositories.relationship import RelationshipRepository


def is_parent_layout_relationship(relationship) -> bool:
    return (
        relationship.relationship_type == RelationshipType.PARENT_CHILD
        or (
            relationship.relationship_type == RelationshipType.OTHER
            and relationship.layout_as == "PARENT_CHILD"
        )
    )


def would_create_parent_cycle(
    relationships,
    parent_id: UUID,
    child_id: UUID,
) -> bool:
    if parent_id == child_id:
        return True

    children_by_parent: dict[UUID, list[UUID]] = {}
    for relationship in relationships:
        if not is_parent_layout_relationship(relationship):
            continue
        children_by_parent.setdefault(relationship.source_person_id, []).append(
            relationship.target_person_id
        )

    stack = [child_id]
    visited: set[UUID] = set()
    while stack:
        person_id = stack.pop()
        if person_id == parent_id:
            return True
        if person_id in visited:
            continue
        visited.add(person_id)
        stack.extend(children_by_parent.get(person_id, []))
    return False


def _is_genealogist(user: User) -> bool:
    return getattr(user, "role", None) == UserRole.GENEALOGIST


class RelationshipService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = RelationshipRepository(db)
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

    async def _get_person_in_profile(self, person_id: UUID, profile_id: UUID) -> Person:
        result = await self.db.execute(
            select(Person)
            .join(ProfilePerson, ProfilePerson.person_id == Person.id)
            .where(Person.id == person_id, ProfilePerson.profile_id == profile_id)
        )
        person = result.scalar_one_or_none()
        if not person:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Person {person_id} not found in this profile",
            )
        return person

    async def create(self, profile_id: UUID, data: RelationshipCreate, user: User) -> Relationship:
        if _is_genealogist(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        await self._assert_profile_access(profile_id, user)
        await self._get_person_in_profile(data.source_person_id, profile_id)
        await self._get_person_in_profile(data.target_person_id, profile_id)

        if is_parent_layout_relationship(data):
            existing_relationships = await self.repo.get_by_profile(profile_id)
            if would_create_parent_cycle(
                existing_relationships,
                data.source_person_id,
                data.target_person_id,
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Parent-child relationship would create a cycle",
                )

        if data.relationship_type == RelationshipType.PARENT_CHILD:
            count_result = await self.db.execute(
                select(func.count(Relationship.id)).where(
                    Relationship.profile_id == profile_id,
                    Relationship.target_person_id == data.target_person_id,
                    Relationship.relationship_type == RelationshipType.PARENT_CHILD,
                )
            )
            if count_result.scalar_one() >= 2:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="A person cannot have more than 2 parents (ontology axiom A4)",
                )

        if await self.repo.exists(
            profile_id,
            data.source_person_id,
            data.target_person_id,
            data.relationship_type,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This relationship already exists",
            )

        return await self.repo.create(profile_id=profile_id, **data.model_dump())

    async def list_by_profile(self, profile_id: UUID, user: User) -> list[Relationship]:
        await self._assert_profile_access(profile_id, user)
        return await self.repo.get_by_profile(profile_id)

    async def update(self, relationship_id: UUID, data: RelationshipUpdate, user: User) -> Relationship:
        if _is_genealogist(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        rel = await self._get_rel_with_access(relationship_id, user)
        updates = data.model_dump(exclude_none=True)
        if not updates:
            return rel
        return await self.repo.update(rel, **updates)

    async def delete(self, relationship_id: UUID, user: User) -> None:
        if _is_genealogist(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        rel = await self._get_rel_with_access(relationship_id, user)
        await self.repo.delete(rel)

    async def _get_rel_with_access(self, relationship_id: UUID, user: User) -> Relationship:
        rel = await self.repo.get_by_id(relationship_id)
        if not rel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Relationship not found"
            )
        await self._assert_profile_access(rel.profile_id, user)
        return rel

    async def get_tree(self, profile_id: UUID, user: User) -> TreeResponse:
        await self._assert_profile_access(profile_id, user)

        persons_result = await self.db.execute(
            select(Person)
            .join(ProfilePerson, ProfilePerson.person_id == Person.id)
            .where(ProfilePerson.profile_id == profile_id)
        )
        persons = list(persons_result.scalars().all())

        relationships = await self.repo.get_by_profile(profile_id)

        nodes = [
            TreeNode(
                id=p.id,
                last_name=p.last_name,
                first_name=p.first_name,
                middle_name=p.middle_name,
                sex=p.sex,
                is_living=p.is_living,
                birth_date=p.birth_date,
                death_date=p.death_date,
                photo_url=p.photo_url,
                created_at=p.created_at,
            )
            for p in persons
        ]

        return TreeResponse(profile_id=profile_id, nodes=nodes, edges=relationships)
