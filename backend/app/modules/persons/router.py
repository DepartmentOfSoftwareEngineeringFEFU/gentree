from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.auth.dependencies import get_current_user
from app.modules.persons.schemas import PersonCreate, PersonRead, PersonUpdate
from app.modules.persons.service import PersonService

router = APIRouter(tags=["persons"])


@router.post(
    "/profiles/{profile_id}/persons",
    response_model=PersonRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_person(
    profile_id: UUID,
    data: PersonCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> PersonRead:
    person = await PersonService(db).create(profile_id, data, current_user)
    return PersonRead.model_validate(person)


@router.get("/profiles/{profile_id}/persons", response_model=list[PersonRead])
async def list_persons(
    profile_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[PersonRead]:
    persons = await PersonService(db).list_by_profile(profile_id, current_user)
    return [PersonRead.model_validate(p) for p in persons]


@router.get("/persons/{person_id}", response_model=PersonRead)
async def get_person(
    person_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> PersonRead:
    person = await PersonService(db).get_by_id(person_id, current_user)
    return PersonRead.model_validate(person)


@router.patch("/persons/{person_id}", response_model=PersonRead)
async def update_person(
    person_id: UUID,
    data: PersonUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> PersonRead:
    person = await PersonService(db).update(person_id, data, current_user)
    return PersonRead.model_validate(person)


@router.delete("/persons/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(
    person_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    await PersonService(db).delete(person_id, current_user)


@router.delete("/persons/{person_id}/photo", response_model=PersonRead)
async def delete_person_photo(
    person_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> PersonRead:
    person = await PersonService(db).delete_photo(person_id, current_user)
    return PersonRead.model_validate(person)


@router.post("/persons/{person_id}/photo", response_model=PersonRead)
async def upload_person_photo(
    person_id: UUID,
    file: UploadFile,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> PersonRead:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be an image")
    person = await PersonService(db).upload_photo(person_id, file, current_user)
    return PersonRead.model_validate(person)
