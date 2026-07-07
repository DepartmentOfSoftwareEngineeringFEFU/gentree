import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    ArchiveRequestStatus,
    ArchiveTemplateBlockType,
    ArchiveTemplateType,
    TemplateFieldCategory,
    TemplateFieldDataType,
    GeneratedArchiveRequestStatus,
)

_archive_request_status_col = Enum(ArchiveRequestStatus, name="archive_request_status", native_enum=False)
_archive_template_type_col = Enum(ArchiveTemplateType, name="archive_template_type", native_enum=False)
_field_data_type_col = Enum(
    TemplateFieldDataType,
    name="template_field_data_type",
    native_enum=False,
    values_callable=lambda values: [item.value for item in values],
)
_field_category_col = Enum(
    TemplateFieldCategory,
    name="template_field_category",
    native_enum=False,
    values_callable=lambda values: [item.value for item in values],
)
_block_type_col = Enum(ArchiveTemplateBlockType, name="archive_template_block_type", native_enum=False)
_generated_archive_request_status_col = Enum(
    GeneratedArchiveRequestStatus,
    name="generated_archive_request_status",
    native_enum=False,
)


class FieldDictionary(Base):
    __tablename__ = "field_dictionary"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_type: Mapped[TemplateFieldDataType] = mapped_column(_field_data_type_col, nullable=False)
    category: Mapped[TemplateFieldCategory] = mapped_column(_field_category_col, nullable=False)
    autofill_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ArchiveRequestTemplate(Base):
    __tablename__ = "archive_request_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    template_type: Mapped[ArchiveTemplateType] = mapped_column(
        _archive_template_type_col,
        nullable=False,
        default=ArchiveTemplateType.CUSTOM,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    fields: Mapped[list["ArchiveRequestTemplateField"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ArchiveRequestTemplateField.sort_order",
    )
    blocks: Mapped[list["ArchiveRequestTemplateBlock"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ArchiveRequestTemplateBlock.sort_order",
    )
    attachments: Mapped[list["ArchiveRequestTemplateAttachment"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ArchiveRequestTemplateAttachment.sort_order",
    )

    __table_args__ = (
        UniqueConstraint("name", "version", name="uq_archive_request_templates_name_version"),
    )


class ArchiveRequestTemplateField(Base):
    __tablename__ = "archive_request_template_fields"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("archive_request_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    field_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("field_dictionary.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    autofill_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_visible_to_genealogist: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    editable_after_autofill: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    template: Mapped[ArchiveRequestTemplate] = relationship(back_populates="fields")
    field: Mapped[FieldDictionary] = relationship(lazy="selectin")

    __table_args__ = (
        UniqueConstraint("template_id", "field_id", name="uq_archive_request_template_fields_field"),
    )


class ArchiveRequestTemplateBlock(Base):
    __tablename__ = "archive_request_template_blocks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("archive_request_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    block_type: Mapped[ArchiveTemplateBlockType] = mapped_column(_block_type_col, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    template: Mapped[ArchiveRequestTemplate] = relationship(back_populates="blocks")


class ArchiveRequestTemplateAttachment(Base):
    __tablename__ = "archive_request_template_attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("archive_request_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    template: Mapped[ArchiveRequestTemplate] = relationship(back_populates="attachments")


class ArchiveRequest(Base):
    __tablename__ = "archive_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assigned_genealogist_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("archive_request_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    request_goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    processing_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    found_information: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_sources: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_recommendations: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    result_persons: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    result_facts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    result_relationships: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    result_document_links: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    current_status: Mapped[ArchiveRequestStatus] = mapped_column(
        _archive_request_status_col,
        default=ArchiveRequestStatus.DRAFT,
        nullable=False,
        index=True,
    )
    requested_archive_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    outgoing_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ArchiveRequestStatusHistory(Base):
    __tablename__ = "archive_request_status_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    archive_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("archive_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    from_status: Mapped[ArchiveRequestStatus | None] = mapped_column(
        _archive_request_status_col,
        nullable=True,
    )
    to_status: Mapped[ArchiveRequestStatus] = mapped_column(
        _archive_request_status_col,
        nullable=False,
    )
    changed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index(
            "ix_archive_request_status_history_req_created",
            "archive_request_id",
            "created_at",
        ),
    )


class GeneratedArchiveRequest(Base):
    __tablename__ = "generated_archive_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_archive_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("archive_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    genealogist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("archive_request_templates.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    template_title_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    template_type_snapshot: Mapped[str] = mapped_column(String(50), nullable=False)
    user_original_request_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    field_values: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    generated_blocks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    final_document_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    attached_document_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    attached_document_titles: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[GeneratedArchiveRequestStatus] = mapped_column(
        _generated_archive_request_status_col,
        default=GeneratedArchiveRequestStatus.DRAFT,
        nullable=False,
        index=True,
    )
    exported_docx_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    exported_pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    exported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
