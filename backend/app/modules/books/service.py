import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.book import GeneratedBook
from app.models.document import Document
from app.models.enums import (
    BookStatus,
    DocumentKind,
    DocumentSourceType,
    NotificationType,
    UserRole,
)
from app.models.notification import Notification
from app.models.user import User
from app.modules.books.narrative import build_book_source, generate_book_narrative
from app.modules.books.renderer import render_book_html
from app.modules.books.schemas import BookCreate
from app.repositories.fact import FactRepository
from app.repositories.person import PersonRepository
from app.repositories.profile import ProfileRepository
from app.repositories.relationship import RelationshipRepository

PENDING_BOOK_TIMEOUT = timedelta(minutes=15)
IN_PROGRESS_BOOK_TIMEOUT = timedelta(hours=2)
STALE_BOOK_ERROR = (
    "Формирование книги было прервано до завершения. Запустите его повторно."
)


def is_stale_book(book: GeneratedBook, now: datetime) -> bool:
    if book.status == BookStatus.PENDING:
        timestamp = book.created_at
        timeout = PENDING_BOOK_TIMEOUT
    elif book.status == BookStatus.IN_PROGRESS:
        timestamp = book.started_at
        timeout = IN_PROGRESS_BOOK_TIMEOUT
    else:
        return False

    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    return now - timestamp > timeout


class BookService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.profile_repo = ProfileRepository(db)
        self.person_repo = PersonRepository(db)
        self.fact_repo = FactRepository(db)
        self.relationship_repo = RelationshipRepository(db)

    async def _get_profile_or_403(self, profile_id: UUID, user: User):
        profile = await self.profile_repo.get_by_id(profile_id)
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
        if user.role != UserRole.ADMIN and profile.owner_user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return profile

    async def create_book(self, profile_id: UUID, user: User) -> GeneratedBook:
        await self._get_profile_or_403(profile_id, user)

        book = GeneratedBook(
            profile_id=profile_id,
            requested_by_user_id=user.id,
            status=BookStatus.PENDING,
        )
        self.db.add(book)
        await self.db.commit()
        await self.db.refresh(book)
        return book

    async def generate_book(
        self,
        book_id: UUID,
        profile_id: UUID,
        user_id: UUID,
        options: BookCreate,
    ) -> None:
        book = await self.db.get(GeneratedBook, book_id)
        profile = await self.profile_repo.get_by_id(profile_id)
        if not book or not profile:
            return

        try:
            book.status = BookStatus.IN_PROGRESS
            book.started_at = datetime.now(UTC)
            book.error_message = None
            await self.db.commit()

            persons = await self.person_repo.get_by_profile(profile_id)
            relationships = await self.relationship_repo.get_by_profile(profile_id)
            facts_by_person = {
                person.id: await self.fact_repo.get_by_person(person.id) for person in persons
            }
            source = build_book_source(
                profile,
                persons,
                relationships,
                facts_by_person,
                options,
            )
            narrative = await generate_book_narrative(
                source,
                options,
                api_key=settings.yandex_api_key,
                folder_id=settings.yandex_folder_id,
                model=settings.yandex_model,
                model_version=settings.yandex_model_version,
            )
            html = render_book_html(source, narrative)
            raw = html.encode("utf-8")

            upload_dir = Path(settings.upload_dir)
            upload_dir.mkdir(parents=True, exist_ok=True)
            destination = upload_dir / f"book_{book.id}.html"
            destination.write_bytes(raw)

            document = Document(
                uploaded_by_user_id=user_id,
                document_kind=DocumentKind.BOOK_RESULT,
                source_type=DocumentSourceType.SYSTEM_GENERATED,
                file_name=f"{profile.title}_книга.html",
                mime_type="text/html; charset=utf-8",
                file_size_bytes=len(raw),
                storage_path=str(destination),
                checksum_sha256=hashlib.sha256(raw).hexdigest(),
            )
            self.db.add(document)
            await self.db.flush()

            book.document_id = document.id
            book.status = BookStatus.SUCCEEDED
            book.error_message = None
            book.finished_at = datetime.now(UTC)
            self.db.add(
                Notification(
                    recipient_user_id=user_id,
                    notification_type=NotificationType.BOOK_READY,
                    title="Генеалогическая книга готова",
                    body=f"Книга исследования «{profile.title}» успешно сформирована.",
                    related_document_id=document.id,
                )
            )
            await self.db.commit()
        except Exception as exc:
            await self.db.rollback()
            book = await self.db.get(GeneratedBook, book_id)
            if not book:
                return
            book.status = BookStatus.FAILED
            book.error_message = str(exc)[:4000]
            book.finished_at = datetime.now(UTC)
            self.db.add(
                Notification(
                    recipient_user_id=user_id,
                    notification_type=NotificationType.SYSTEM,
                    title="Не удалось сформировать книгу",
                    body=f"Генерация книги завершилась ошибкой: {str(exc)[:500]}",
                )
            )
            await self.db.commit()

    async def list_books(self, profile_id: UUID, user: User) -> list[GeneratedBook]:
        await self._get_profile_or_403(profile_id, user)
        result = await self.db.execute(
            select(GeneratedBook)
            .where(GeneratedBook.profile_id == profile_id)
            .order_by(GeneratedBook.created_at.desc())
        )
        books = list(result.scalars().all())
        now = datetime.now(UTC)
        stale_books = [book for book in books if is_stale_book(book, now)]
        for book in stale_books:
            book.status = BookStatus.FAILED
            book.error_message = STALE_BOOK_ERROR
            book.finished_at = now
        if stale_books:
            await self.db.commit()
        return books


async def generate_book_in_background(
    book_id: UUID,
    profile_id: UUID,
    user_id: UUID,
    options: dict,
) -> None:
    async with SessionLocal() as db:
        await BookService(db).generate_book(
            book_id,
            profile_id,
            user_id,
            BookCreate.model_validate(options),
        )
