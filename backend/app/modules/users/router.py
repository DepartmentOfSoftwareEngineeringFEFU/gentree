from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.session import get_db_session
from app.models.enums import UserRole, UserStatus
from app.modules.auth.dependencies import require_role
from app.repositories.archive_request import ArchiveRequestRepository
from app.repositories.user import UserRepository
from app.schemas.user import AdminUserUpdate, GenealogistCreate, UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/ping")
async def users_ping() -> dict[str, str]:
    return {"module": "users", "status": "ready"}


@router.get("", response_model=list[UserRead])
async def list_users(
    role: UserRole | None = None,
    status: UserStatus | None = None,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> list[UserRead]:
    users = await UserRepository(db).list(role=role, status=status)
    return [UserRead.model_validate(user) for user in users]


@router.post(
    "/genealogists",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_genealogist(
    data: GenealogistCreate,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> UserRead:
    repo = UserRepository(db)
    if await repo.get_by_email(data.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = await repo.create(
        email=data.email,
        hashed_password=hash_password(data.password),
        role=UserRole.GENEALOGIST,
        status=UserStatus.ACTIVE,
        first_name=data.first_name,
        last_name=data.last_name,
        middle_name=data.middle_name,
        notes=data.notes,
    )
    return UserRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: UUID,
    data: AdminUserUpdate,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> UserRead:
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role != UserRole.GENEALOGIST:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only genealogist accounts can be managed here",
        )

    updates = data.model_dump(exclude_none=True)
    if updates.get("status") not in (None, UserStatus.ACTIVE, UserStatus.BLOCKED):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Genealogist status must be ACTIVE or BLOCKED",
        )
    if "email" in updates:
        existing = await repo.get_by_email(updates["email"])
        if existing and existing.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

    if updates:
        user = await repo.update(user, **updates)
        if updates.get("status") == UserStatus.BLOCKED:
            await ArchiveRequestRepository(db).unassign_active_by_assignee(user.id)
    return UserRead.model_validate(user)
