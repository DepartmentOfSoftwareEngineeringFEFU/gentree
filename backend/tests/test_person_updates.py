from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.modules.persons.schemas import PersonUpdate
from app.modules.persons.service import PersonService


def person_service(person) -> PersonService:
    service = PersonService(AsyncMock())
    service._get_person_with_access = AsyncMock(return_value=person)
    service.person_repo.update = AsyncMock(return_value=person)
    return service


@pytest.mark.asyncio
async def test_update_can_clear_death_date() -> None:
    person = SimpleNamespace(id=uuid4(), death_date=date(2000, 5, 20))
    service = person_service(person)

    await service.update(person.id, PersonUpdate(death_date=None), SimpleNamespace())

    service.person_repo.update.assert_awaited_once_with(person, death_date=None)


@pytest.mark.asyncio
async def test_update_does_not_clear_omitted_fields() -> None:
    person = SimpleNamespace(id=uuid4(), death_date=date(2000, 5, 20))
    service = person_service(person)

    result = await service.update(person.id, PersonUpdate(), SimpleNamespace())

    assert result is person
    service.person_repo.update.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_ignores_null_for_required_fields() -> None:
    person = SimpleNamespace(id=uuid4(), first_name="Иван", death_date=date(2000, 5, 20))
    service = person_service(person)

    await service.update(
        person.id,
        PersonUpdate(first_name=None, death_date=None),
        SimpleNamespace(),
    )

    service.person_repo.update.assert_awaited_once_with(person, death_date=None)
