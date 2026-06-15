from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.enums import RelationshipType
from app.modules.relationships.schemas import RelationshipCreate
from app.modules.relationships.service import (
    RelationshipService,
    would_create_parent_cycle,
)


def parent_edge(source, target, *, relationship_type=RelationshipType.PARENT_CHILD):
    return SimpleNamespace(
        source_person_id=source,
        target_person_id=target,
        relationship_type=relationship_type,
        layout_as="PARENT_CHILD" if relationship_type == RelationshipType.OTHER else None,
    )


def test_rejects_direct_parent_cycle() -> None:
    parent = uuid4()
    child = uuid4()

    assert would_create_parent_cycle(
        [parent_edge(parent, child)],
        child,
        parent,
    )


def test_rejects_transitive_parent_cycle() -> None:
    grandparent = uuid4()
    parent = uuid4()
    child = uuid4()

    assert would_create_parent_cycle(
        [
            parent_edge(grandparent, parent),
            parent_edge(parent, child, relationship_type=RelationshipType.OTHER),
        ],
        child,
        grandparent,
    )


def test_accepts_non_cyclic_parent_branch() -> None:
    first_parent = uuid4()
    second_parent = uuid4()
    child = uuid4()

    assert not would_create_parent_cycle(
        [parent_edge(first_parent, child)],
        second_parent,
        child,
    )


def cycle_service(existing_relationships) -> RelationshipService:
    service = RelationshipService(AsyncMock())
    service._assert_profile_access = AsyncMock()
    service._get_person_in_profile = AsyncMock()
    service.repo.get_by_profile = AsyncMock(return_value=existing_relationships)
    return service


@pytest.mark.asyncio
async def test_create_returns_422_for_direct_parent_cycle() -> None:
    profile_id = uuid4()
    parent = uuid4()
    child = uuid4()
    service = cycle_service([parent_edge(parent, child)])
    data = RelationshipCreate(
        source_person_id=child,
        target_person_id=parent,
        relationship_type=RelationshipType.PARENT_CHILD,
    )

    with pytest.raises(HTTPException) as error:
        await service.create(profile_id, data, SimpleNamespace())

    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_create_returns_422_for_transitive_other_parent_cycle() -> None:
    profile_id = uuid4()
    grandparent = uuid4()
    parent = uuid4()
    child = uuid4()
    service = cycle_service([
        parent_edge(grandparent, parent),
        parent_edge(parent, child),
    ])
    data = RelationshipCreate(
        source_person_id=child,
        target_person_id=grandparent,
        relationship_type=RelationshipType.OTHER,
        layout_as="PARENT_CHILD",
    )

    with pytest.raises(HTTPException) as error:
        await service.create(profile_id, data, SimpleNamespace())

    assert error.value.status_code == 422
