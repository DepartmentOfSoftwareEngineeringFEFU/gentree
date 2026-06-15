from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.enums import BookStatus
from app.modules.books.narrative import (
    AIBookDraft,
    BookChapter,
    build_book_source,
    build_fallback_narrative,
    generate_book_narrative,
)
from app.modules.books.renderer import render_book_html
from app.modules.books.schemas import BookCreate, BookTone
from app.modules.books.service import (
    IN_PROGRESS_BOOK_TIMEOUT,
    PENDING_BOOK_TIMEOUT,
    is_stale_book,
)


def person(name: str, *, birth_year: int | None = None):
    return SimpleNamespace(
        id=uuid4(),
        last_name=name,
        first_name="",
        middle_name=None,
        sex="UNKNOWN",
        birth_date=date(birth_year, 1, 1) if birth_year else None,
        death_date=None,
        birth_place=None,
        death_place=None,
        notes=None,
        is_living=True,
    )


def fact(person_id, confidence: str, description: str):
    return SimpleNamespace(
        person_id=person_id,
        fact_type="NOTE",
        fact_date=None,
        place=None,
        value_text=description,
        notes=None,
        confidence=confidence,
    )


def relationship(parent, child):
    return SimpleNamespace(
        source_person_id=parent.id,
        target_person_id=child.id,
        relationship_type="PARENT_CHILD",
        layout_as=None,
        start_date=None,
        end_date=None,
        notes=None,
    )


def source_fixture(*, include_unverified: bool = True):
    parent = person("Родитель", birth_year=1960)
    child = person("Ребёнок", birth_year=1990)
    profile = SimpleNamespace(
        title="Семейное исследование",
        description="История семьи",
    )
    source = build_book_source(
        profile,
        [child, parent],
        [relationship(parent, child)],
        {
            parent.id: [
                fact(parent.id, "CONFIRMED", "Подтверждённое событие"),
                fact(parent.id, "UNVERIFIED", "Непроверенное событие"),
            ],
            child.id: [],
        },
        BookCreate(include_unverified=include_unverified),
    )
    return source


def test_fallback_book_contains_every_person_and_relationship() -> None:
    source = source_fixture()
    narrative = build_fallback_narrative(source)

    assert [chapter.person_id for chapter in narrative.chapters] == [
        person["id"] for person in source["persons"]
    ]
    assert any("Ребёнок:" in relation for relation in source["persons"][0]["relationships"])
    assert any("Родитель:" in relation for relation in source["persons"][1]["relationships"])


def test_unverified_facts_can_be_excluded() -> None:
    source = source_fixture(include_unverified=False)
    facts = source["persons"][0]["facts"]

    assert [item["confidence"] for item in facts] == ["CONFIRMED"]


class FakeModel:
    def __init__(self, draft):
        self.draft = draft

    def configure(self, **kwargs):
        assert kwargs["response_format"] is AIBookDraft
        return self

    async def run(self, messages, *, timeout):
        assert timeout == 180
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        return [SimpleNamespace(text=self.draft.model_dump_json())]


class FakeModels:
    def __init__(self, draft):
        self.draft = draft

    def completions(self, model, *, model_version):
        assert model == "test-model"
        assert model_version == "test-version"
        return FakeModel(self.draft)


class FakeSDK:
    def __init__(self, draft):
        self.models = FakeModels(draft)


@pytest.mark.asyncio
async def test_missing_yandex_key_uses_fallback() -> None:
    source = source_fixture()

    narrative = await generate_book_narrative(
        source,
        BookCreate(),
        api_key=None,
        folder_id=None,
        model="yandexgpt",
        model_version="rc",
    )

    assert not narrative.generated_by_ai
    assert len(narrative.chapters) == len(source["persons"])


@pytest.mark.asyncio
async def test_ai_result_fills_a_missing_person_with_fallback() -> None:
    source = source_fixture()
    first_person = source["persons"][0]
    draft = AIBookDraft(
        title="AI-книга",
        subtitle="Подзаголовок",
        introduction="Введение",
        chapters=[
            BookChapter(
                person_id=first_person["id"],
                title=first_person["name"],
                lead="AI-глава",
                narrative="Сформированный текст.",
            )
        ],
    )

    narrative = await generate_book_narrative(
        source,
        BookCreate(tone=BookTone.WARM),
        api_key="test",
        folder_id="test-folder",
        model="test-model",
        model_version="test-version",
        sdk=FakeSDK(draft),
    )

    assert narrative.generated_by_ai
    assert len(narrative.chapters) == len(source["persons"])
    assert narrative.chapters[0].lead == "AI-глава"
    assert narrative.chapters[1].lead == "Краткая биографическая справка"


def test_renderer_escapes_profile_and_generated_text() -> None:
    source = source_fixture()
    source["profile"]["title"] = "<script>alert(1)</script>"
    narrative = build_fallback_narrative(source)
    narrative.chapters[0].narrative = "<img src=x onerror=alert(1)>"

    html = render_book_html(source, narrative)

    assert "<script>alert(1)</script>" not in html
    assert "<img src=x onerror=alert(1)>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "&lt;img src=x onerror=alert(1)&gt;" in html


def test_only_expired_active_books_are_stale() -> None:
    now = datetime.now(UTC)

    pending = SimpleNamespace(
        status=BookStatus.PENDING,
        created_at=now - PENDING_BOOK_TIMEOUT - timedelta(seconds=1),
        started_at=now,
    )
    running = SimpleNamespace(
        status=BookStatus.IN_PROGRESS,
        created_at=now,
        started_at=now - IN_PROGRESS_BOOK_TIMEOUT + timedelta(seconds=1),
    )
    completed = SimpleNamespace(
        status=BookStatus.SUCCEEDED,
        created_at=now - timedelta(days=30),
        started_at=now - timedelta(days=30),
    )

    assert is_stale_book(pending, now)
    assert not is_stale_book(running, now)
    assert not is_stale_book(completed, now)
