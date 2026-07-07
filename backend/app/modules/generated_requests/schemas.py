from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ArchiveTemplateType, GeneratedArchiveRequestStatus
from app.modules.templates.schemas import ArchiveTemplateRead


class ActiveTemplateSummary(BaseModel):
    id: UUID
    name: str
    template_type: ArchiveTemplateType
    description: str | None
    fields_count: int
    blocks_count: int
    has_required_attachments: bool
    updated_at: datetime


class GeneratedArchiveRequestStart(BaseModel):
    template_id: UUID


class GeneratedFieldValue(BaseModel):
    value: str | bool | None = None
    autofilled: bool = False
    source: str | None = None
    missing_autofill: bool = False


class GeneratedArchiveRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_archive_request_id: UUID
    genealogist_id: UUID
    template_id: UUID
    template_title_snapshot: str
    template_type_snapshot: str
    user_original_request_text: str | None
    context_comment: str | None
    field_values: dict[str, GeneratedFieldValue]
    generated_blocks: list[dict] = Field(default_factory=list)
    final_document_text: str | None
    attached_document_ids: list[UUID]
    attached_document_titles: dict[str, str] = Field(default_factory=dict)
    status: GeneratedArchiveRequestStatus
    exported_docx_url: str | None
    exported_pdf_url: str | None
    created_at: datetime
    updated_at: datetime
    exported_at: datetime | None
    sent_at: datetime | None
    template: ArchiveTemplateRead | None = None


class GeneratedArchiveRequestListRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_archive_request_id: UUID
    template_title_snapshot: str
    template_type_snapshot: str
    status: GeneratedArchiveRequestStatus
    created_at: datetime
    updated_at: datetime
    exported_at: datetime | None
    sent_at: datetime | None


class FieldValuesUpdate(BaseModel):
    field_values: dict[str, GeneratedFieldValue]


class FinalTextUpdate(BaseModel):
    final_document_text: str


class AttachmentsUpdate(BaseModel):
    attached_document_ids: list[UUID] = Field(default_factory=list)
    attached_document_titles: dict[str, str] = Field(default_factory=dict)


class CommentUpdate(BaseModel):
    context_comment: str | None = None


class StatusUpdate(BaseModel):
    status: GeneratedArchiveRequestStatus


class GeneratedPreviewRead(BaseModel):
    generated_blocks: list[dict]
    final_document_text: str
    missing_required_field_codes: list[str] = Field(default_factory=list)


class AvailableAttachmentRead(BaseModel):
    id: UUID
    file_name: str
    document_kind: str
    source_type: str
    created_at: datetime
    bound_to: str
    comment: str | None = None
