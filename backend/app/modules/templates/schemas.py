from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import (
    ArchiveTemplateBlockType,
    ArchiveTemplateType,
    TemplateFieldCategory,
    TemplateFieldDataType,
)


class FieldDictionaryCreate(BaseModel):
    code: str | None = None
    title: str
    description: str | None = None
    data_type: TemplateFieldDataType = TemplateFieldDataType.TEXT
    category: TemplateFieldCategory = TemplateFieldCategory.CUSTOM
    autofill_source: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Field title cannot be empty")
        return value


class FieldDictionaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    title: str
    description: str | None
    data_type: TemplateFieldDataType
    category: TemplateFieldCategory
    autofill_source: str | None
    is_system: bool
    created_at: datetime
    updated_at: datetime


class TemplateFieldInput(BaseModel):
    field_id: UUID
    is_required: bool = False
    autofill_enabled: bool = False
    is_visible_to_genealogist: bool = True
    sort_order: int = 0
    hint: str | None = None
    default_value: str | None = None
    editable_after_autofill: bool = True


class TemplateFieldRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    template_id: UUID
    field_id: UUID
    is_required: bool
    autofill_enabled: bool
    is_visible_to_genealogist: bool
    sort_order: int
    hint: str | None
    default_value: str | None
    editable_after_autofill: bool
    created_at: datetime
    updated_at: datetime
    field: FieldDictionaryRead


class TemplateBlockInput(BaseModel):
    id: UUID | None = None
    block_type: ArchiveTemplateBlockType
    title: str | None = None
    content: str = ""
    sort_order: int = 0
    is_required: bool = False
    is_active: bool = True


class TemplateBlockRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    template_id: UUID
    block_type: ArchiveTemplateBlockType
    title: str | None
    content: str
    sort_order: int
    is_required: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TemplateAttachmentInput(BaseModel):
    id: UUID | None = None
    title: str
    description: str | None = None
    is_required: bool = False
    sort_order: int = 0

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Attachment title cannot be empty")
        return value


class TemplateAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    template_id: UUID
    title: str
    description: str | None
    is_required: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class ArchiveTemplateBase(BaseModel):
    name: str
    template_type: ArchiveTemplateType
    description: str | None = None
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Template name cannot be empty")
        return value


class ArchiveTemplateCreate(ArchiveTemplateBase):
    fields: list[TemplateFieldInput] = Field(default_factory=list)
    blocks: list[TemplateBlockInput] = Field(default_factory=list)
    attachments: list[TemplateAttachmentInput] = Field(default_factory=list)


class ArchiveTemplateUpdate(ArchiveTemplateBase):
    fields: list[TemplateFieldInput] = Field(default_factory=list)
    blocks: list[TemplateBlockInput] = Field(default_factory=list)
    attachments: list[TemplateAttachmentInput] = Field(default_factory=list)


class ArchiveTemplateListRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    template_type: ArchiveTemplateType
    description: str | None
    version: int
    is_active: bool
    fields_count: int
    blocks_count: int
    created_at: datetime
    updated_at: datetime


class ArchiveTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    template_type: ArchiveTemplateType
    description: str | None
    version: int
    is_active: bool
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime
    fields: list[TemplateFieldRead]
    blocks: list[TemplateBlockRead]
    attachments: list[TemplateAttachmentRead]


class TemplateDeleteResponse(BaseModel):
    deleted: bool
    soft_deleted: bool
