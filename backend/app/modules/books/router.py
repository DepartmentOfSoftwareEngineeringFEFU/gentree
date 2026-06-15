from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.auth.dependencies import get_current_user
from app.modules.books.schemas import BookCreate, BookRead
from app.modules.books.service import BookService, generate_book_in_background

router = APIRouter(tags=["books"])


@router.post(
    "/profiles/{profile_id}/book",
    response_model=BookRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_book(
    profile_id: UUID,
    data: BookCreate,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> BookRead:
    book = await BookService(db).create_book(profile_id, current_user)
    background_tasks.add_task(
        generate_book_in_background,
        book.id,
        profile_id,
        current_user.id,
        data.model_dump(mode="json"),
    )
    return BookRead.model_validate(book)


@router.get("/profiles/{profile_id}/books", response_model=list[BookRead])
async def list_books(
    profile_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[BookRead]:
    books = await BookService(db).list_books(profile_id, current_user)
    return [BookRead.model_validate(b) for b in books]
