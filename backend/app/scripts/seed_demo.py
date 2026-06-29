"""Seed a demo USER account with a populated family tree for reviewers.

Usage:
    python -m app.scripts.seed_demo [email] [password]

Creates (or resets) a demo user with a completed profile containing three
generations of persons, parent/spouse relationships (including one former
marriage, to show the "former union" rendering) and a few sample facts —
so the tree and fact pages are not empty on first login.
"""
from __future__ import annotations

import asyncio
import sys
from datetime import date

from sqlalchemy import delete, select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.enums import (
    FactConfidence,
    FactType,
    PersonSex,
    ProfileStatus,
    RelationshipType,
    UserRole,
    UserStatus,
)
from app.models.fact import Fact
from app.models.profile import Person, Profile, ProfilePerson, Relationship
from app.models.user import User

DEFAULT_EMAIL = "demo@example.com"
DEFAULT_PASSWORD = "demo12345"


async def _reset_existing_profiles(session, user: User) -> None:
    profile_ids = (
        await session.execute(select(Profile.id).where(Profile.owner_user_id == user.id))
    ).scalars().all()
    if not profile_ids:
        return
    person_ids = (
        await session.execute(
            select(ProfilePerson.person_id).where(ProfilePerson.profile_id.in_(profile_ids))
        )
    ).scalars().all()
    await session.execute(delete(Relationship).where(Relationship.profile_id.in_(profile_ids)))
    if person_ids:
        await session.execute(delete(Fact).where(Fact.person_id.in_(person_ids)))
    await session.execute(delete(ProfilePerson).where(ProfilePerson.profile_id.in_(profile_ids)))
    await session.execute(delete(Profile).where(Profile.id.in_(profile_ids)))
    if person_ids:
        await session.execute(delete(Person).where(Person.id.in_(person_ids)))


async def seed(email: str, password: str) -> None:
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            user = User(
                email=email,
                hashed_password=hash_password(password),
                role=UserRole.USER,
                status=UserStatus.ACTIVE,
                first_name="Демо",
                last_name="Пользователь",
            )
            session.add(user)
            await session.flush()
        else:
            user.hashed_password = hash_password(password)
            await _reset_existing_profiles(session, user)
            await session.flush()

        profile = Profile(
            owner_user_id=user.id,
            title="Семья Ивановых",
            description="Демонстрационное генеалогическое исследование для проверки проекта.",
            status=ProfileStatus.COMPLETED,
            started_at=date(2024, 1, 10),
            completed_at=date.today(),
        )
        session.add(profile)
        await session.flush()

        def person(**kwargs) -> Person:
            p = Person(**kwargs)
            session.add(p)
            return p

        grandfather = person(
            last_name="Иванов", first_name="Пётр", middle_name="Сергеевич",
            sex=PersonSex.MALE, birth_date=date(1945, 3, 12), death_date=date(2015, 11, 2),
            birth_place="г. Владивосток", is_living=False,
        )
        grandmother = person(
            last_name="Иванова", first_name="Мария", middle_name="Александровна", maiden_name="Кузнецова",
            sex=PersonSex.FEMALE, birth_date=date(1948, 7, 4), birth_place="г. Уссурийск", is_living=True,
        )
        father = person(
            last_name="Иванов", first_name="Сергей", middle_name="Петрович",
            sex=PersonSex.MALE, birth_date=date(1972, 2, 20), birth_place="г. Владивосток", is_living=True,
        )
        first_wife = person(
            last_name="Иванова", first_name="Татьяна", middle_name="Олеговна", maiden_name="Петрова",
            sex=PersonSex.FEMALE, birth_date=date(1973, 5, 9), is_living=True,
        )
        mother = person(
            last_name="Иванова", first_name="Елена", middle_name="Викторовна", maiden_name="Смирнова",
            sex=PersonSex.FEMALE, birth_date=date(1974, 9, 30), birth_place="г. Артём", is_living=True,
        )
        aunt = person(
            last_name="Соколова", first_name="Ольга", middle_name="Петровна", maiden_name="Иванова",
            sex=PersonSex.FEMALE, birth_date=date(1975, 12, 15), is_living=True,
        )
        uncle = person(
            last_name="Соколов", first_name="Дмитрий", middle_name="Игоревич",
            sex=PersonSex.MALE, birth_date=date(1973, 4, 18), is_living=True,
        )
        son = person(
            last_name="Иванов", first_name="Алексей", middle_name="Сергеевич",
            sex=PersonSex.MALE, birth_date=date(1998, 6, 1), is_living=True,
        )
        daughter = person(
            last_name="Иванова", first_name="Анна", middle_name="Сергеевна",
            sex=PersonSex.FEMALE, birth_date=date(2001, 10, 23), is_living=True,
        )
        cousin = person(
            last_name="Соколова", first_name="Мария", middle_name="Дмитриевна",
            sex=PersonSex.FEMALE, birth_date=date(2000, 1, 17), is_living=True,
        )
        await session.flush()

        people = [grandfather, grandmother, father, first_wife, mother, aunt, uncle, son, daughter, cousin]
        session.add_all(ProfilePerson(profile_id=profile.id, person_id=p.id) for p in people)

        def union(a: Person, b: Person, start: date, end: date | None = None) -> Relationship:
            return Relationship(
                profile_id=profile.id, source_person_id=a.id, target_person_id=b.id,
                relationship_type=RelationshipType.SPOUSE, start_date=start, end_date=end,
            )

        def parent_child(parent_: Person, child: Person) -> Relationship:
            return Relationship(
                profile_id=profile.id, source_person_id=parent_.id, target_person_id=child.id,
                relationship_type=RelationshipType.PARENT_CHILD,
            )

        session.add_all([
            union(grandfather, grandmother, date(1970, 5, 12)),
            union(father, first_wife, date(1993, 8, 1), date(1995, 3, 1)),
            union(father, mother, date(1996, 9, 14)),
            union(aunt, uncle, date(1997, 6, 21)),
            parent_child(grandfather, father),
            parent_child(grandmother, father),
            parent_child(grandfather, aunt),
            parent_child(grandmother, aunt),
            parent_child(father, son),
            parent_child(mother, son),
            parent_child(father, daughter),
            parent_child(mother, daughter),
            parent_child(aunt, cousin),
            parent_child(uncle, cousin),
        ])

        session.add_all([
            Fact(person_id=grandfather.id, fact_type=FactType.BIRTH, fact_date=grandfather.birth_date,
                 place="г. Владивосток", confidence=FactConfidence.CONFIRMED),
            Fact(person_id=grandfather.id, fact_type=FactType.SERVICE,
                 value_text="Служил на Тихоокеанском флоте, 1963–1967 гг.", confidence=FactConfidence.PROBABLE),
            Fact(person_id=grandfather.id, fact_type=FactType.DEATH, fact_date=grandfather.death_date,
                 place="г. Владивосток", confidence=FactConfidence.CONFIRMED),
            Fact(person_id=grandmother.id, fact_type=FactType.RESIDENCE,
                 place="г. Владивосток, ул. Светланская", confidence=FactConfidence.CONFIRMED),
            Fact(person_id=father.id, fact_type=FactType.MARRIAGE, fact_date=date(1996, 9, 14),
                 value_text="Регистрация брака в г. Владивостоке", confidence=FactConfidence.CONFIRMED),
        ])

        await session.commit()
        print(f"Demo user ready: {email} / {password}")
        print(f"Profile \"{profile.title}\" created with {len(people)} persons.")


def main() -> None:
    email = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_EMAIL
    password = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PASSWORD
    asyncio.run(seed(email, password))


if __name__ == "__main__":
    main()
