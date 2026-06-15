from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.enums import UserRole
from app.modules.auth.dependencies import require_role
from app.modules.generated_requests.schemas import (
    ActiveTemplateSummary,
    AttachmentsUpdate,
    AvailableAttachmentRead,
    CommentUpdate,
    FieldValuesUpdate,
    FinalTextUpdate,
    GeneratedArchiveRequestListRead,
    GeneratedArchiveRequestRead,
    GeneratedArchiveRequestStart,
    GeneratedPreviewRead,
    StatusUpdate,
)
from app.modules.generated_requests.service import GeneratedArchiveRequestService
from app.modules.templates.schemas import ArchiveTemplateRead

router = APIRouter(prefix="/genealogist", tags=["generated_archive_requests"])


@router.get("/archive-request-templates/active", response_model=list[ActiveTemplateSummary])
async def list_active_templates(
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> list[ActiveTemplateSummary]:
    return await GeneratedArchiveRequestService(db).list_active_templates(current_user)


@router.get(
    "/archive-requests/{archive_request_id}/generated-documents",
    response_model=list[GeneratedArchiveRequestListRead],
)
async def list_generated_documents(
    archive_request_id: UUID,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> list[GeneratedArchiveRequestListRead]:
    items = await GeneratedArchiveRequestService(db).list_by_archive_request(
        archive_request_id, current_user
    )
    return [GeneratedArchiveRequestListRead.model_validate(item) for item in items]


@router.post(
    "/archive-requests/{archive_request_id}/generated-documents/start",
    response_model=GeneratedArchiveRequestRead,
    status_code=status.HTTP_201_CREATED,
)
async def start_generated_document(
    archive_request_id: UUID,
    data: GeneratedArchiveRequestStart,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> GeneratedArchiveRequestRead:
    item = await GeneratedArchiveRequestService(db).start(
        archive_request_id, data.template_id, current_user
    )
    return GeneratedArchiveRequestRead.model_validate(item)


@router.get("/generated-documents/{generated_id}", response_model=GeneratedArchiveRequestRead)
async def get_generated_document(
    generated_id: UUID,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> GeneratedArchiveRequestRead:
    service = GeneratedArchiveRequestService(db)
    item = await service.get(generated_id, current_user)
    data = GeneratedArchiveRequestRead.model_validate(item)
    template = await service._get_template(item.template_id)
    data.template = ArchiveTemplateRead.model_validate(template)
    return data


@router.patch("/generated-documents/{generated_id}/fields", response_model=GeneratedArchiveRequestRead)
async def update_generated_fields(
    generated_id: UUID,
    data: FieldValuesUpdate,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> GeneratedArchiveRequestRead:
    item = await GeneratedArchiveRequestService(db).update_fields(
        generated_id,
        {key: value.model_dump(mode="json") for key, value in data.field_values.items()},
        current_user,
    )
    return GeneratedArchiveRequestRead.model_validate(item)


@router.patch("/generated-documents/{generated_id}/final-text", response_model=GeneratedArchiveRequestRead)
async def update_final_text(
    generated_id: UUID,
    data: FinalTextUpdate,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> GeneratedArchiveRequestRead:
    item = await GeneratedArchiveRequestService(db).update_final_text(
        generated_id, data.final_document_text, current_user
    )
    return GeneratedArchiveRequestRead.model_validate(item)


@router.patch("/generated-documents/{generated_id}/attachments", response_model=GeneratedArchiveRequestRead)
async def update_attachments(
    generated_id: UUID,
    data: AttachmentsUpdate,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> GeneratedArchiveRequestRead:
    item = await GeneratedArchiveRequestService(db).update_attachments(
        generated_id, data.attached_document_ids, current_user
    )
    return GeneratedArchiveRequestRead.model_validate(item)


@router.patch("/generated-documents/{generated_id}/comment", response_model=GeneratedArchiveRequestRead)
async def update_comment(
    generated_id: UUID,
    data: CommentUpdate,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> GeneratedArchiveRequestRead:
    item = await GeneratedArchiveRequestService(db).update_comment(
        generated_id, data.context_comment, current_user
    )
    return GeneratedArchiveRequestRead.model_validate(item)


@router.post("/generated-documents/{generated_id}/preview", response_model=GeneratedPreviewRead)
async def preview_generated_document(
    generated_id: UUID,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> GeneratedPreviewRead:
    blocks, text, missing = await GeneratedArchiveRequestService(db).preview(generated_id, current_user)
    return GeneratedPreviewRead(
        generated_blocks=blocks,
        final_document_text=text,
        missing_required_field_codes=missing,
    )


@router.post("/generated-documents/{generated_id}/export", response_model=GeneratedArchiveRequestRead)
async def export_generated_document(
    generated_id: UUID,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> GeneratedArchiveRequestRead:
    item = await GeneratedArchiveRequestService(db).export(generated_id, current_user)
    return GeneratedArchiveRequestRead.model_validate(item)


@router.patch("/generated-documents/{generated_id}/status", response_model=GeneratedArchiveRequestRead)
async def update_generated_status(
    generated_id: UUID,
    data: StatusUpdate,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> GeneratedArchiveRequestRead:
    item = await GeneratedArchiveRequestService(db).update_status(
        generated_id, data.status, current_user
    )
    return GeneratedArchiveRequestRead.model_validate(item)


@router.post("/generated-documents/{generated_id}/save-draft", response_model=GeneratedArchiveRequestRead)
async def save_generated_draft(
    generated_id: UUID,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> GeneratedArchiveRequestRead:
    item = await GeneratedArchiveRequestService(db).save_draft(generated_id, current_user)
    return GeneratedArchiveRequestRead.model_validate(item)


@router.get(
    "/generated-documents/{generated_id}/available-attachments",
    response_model=list[AvailableAttachmentRead],
)
async def available_attachments(
    generated_id: UUID,
    current_user=Depends(require_role(UserRole.GENEALOGIST)),
    db: AsyncSession = Depends(get_db_session),
) -> list[AvailableAttachmentRead]:
    return await GeneratedArchiveRequestService(db).available_attachments(generated_id, current_user)
