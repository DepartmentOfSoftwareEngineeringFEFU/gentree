from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.enums import ArchiveTemplateType, TemplateFieldCategory, UserRole
from app.modules.auth.dependencies import require_role
from app.modules.templates.schemas import (
    ArchiveTemplateCreate,
    ArchiveTemplateListRead,
    ArchiveTemplateRead,
    ArchiveTemplateUpdate,
    FieldDictionaryCreate,
    FieldDictionaryRead,
    TemplateDeleteResponse,
)
from app.modules.templates.service import TemplateService

router = APIRouter(tags=["templates"])


@router.get(
    "/archive-request-templates",
    response_model=list[ArchiveTemplateListRead],
)
async def list_archive_request_templates(
    template_type: ArchiveTemplateType | None = None,
    status_filter: str | None = None,
    search: str | None = None,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> list[ArchiveTemplateListRead]:
    return await TemplateService(db).list_templates(template_type, status_filter, search)


@router.post(
    "/archive-request-templates",
    response_model=ArchiveTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_archive_request_template(
    data: ArchiveTemplateCreate,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveTemplateRead:
    template = await TemplateService(db).create_template(data, current_user)
    return ArchiveTemplateRead.model_validate(template)


@router.get(
    "/archive-request-templates/{template_id}",
    response_model=ArchiveTemplateRead,
)
async def get_archive_request_template(
    template_id: UUID,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveTemplateRead:
    template = await TemplateService(db).get_template(template_id)
    return ArchiveTemplateRead.model_validate(template)


@router.put(
    "/archive-request-templates/{template_id}",
    response_model=ArchiveTemplateRead,
)
async def update_archive_request_template(
    template_id: UUID,
    data: ArchiveTemplateUpdate,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveTemplateRead:
    template = await TemplateService(db).update_template(template_id, data)
    return ArchiveTemplateRead.model_validate(template)


@router.patch(
    "/archive-request-templates/{template_id}/toggle",
    response_model=ArchiveTemplateRead,
)
async def toggle_archive_request_template(
    template_id: UUID,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveTemplateRead:
    template = await TemplateService(db).toggle_template(template_id)
    return ArchiveTemplateRead.model_validate(template)


@router.post(
    "/archive-request-templates/{template_id}/duplicate",
    response_model=ArchiveTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_archive_request_template(
    template_id: UUID,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveTemplateRead:
    template = await TemplateService(db).duplicate_template(template_id, current_user)
    return ArchiveTemplateRead.model_validate(template)


@router.delete(
    "/archive-request-templates/{template_id}",
    response_model=TemplateDeleteResponse,
)
async def delete_archive_request_template(
    template_id: UUID,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> TemplateDeleteResponse:
    deleted, soft_deleted = await TemplateService(db).delete_template(template_id)
    return TemplateDeleteResponse(deleted=deleted, soft_deleted=soft_deleted)


@router.get("/field-dictionary", response_model=list[FieldDictionaryRead])
async def list_field_dictionary(
    search: str | None = None,
    category: TemplateFieldCategory | None = None,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> list[FieldDictionaryRead]:
    fields = await TemplateService(db).list_fields(search, category)
    return [FieldDictionaryRead.model_validate(field) for field in fields]


@router.post(
    "/field-dictionary",
    response_model=FieldDictionaryRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_field_dictionary_item(
    data: FieldDictionaryCreate,
    current_user=Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
) -> FieldDictionaryRead:
    field = await TemplateService(db).create_field(data)
    return FieldDictionaryRead.model_validate(field)
