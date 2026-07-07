from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import ArchiveRequestStatus


class ArchiveRequestCreate(BaseModel):
    title: str
    request_goal: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title cannot be empty")
        return v.strip()


class ArchiveRequestUpdate(BaseModel):
    title: str | None = None
    request_goal: str | None = None
    processing_comment: str | None = None
    result_summary: str | None = None
    found_information: str | None = None
    result_sources: str | None = None
    result_recommendations: str | None = None
    result_status: str | None = None
    result_persons: list[dict] | None = None
    result_facts: list[dict] | None = None
    result_relationships: list[dict] | None = None
    result_document_links: list[dict] | None = None
    outgoing_number: str | None = None


class StatusChangeRequest(BaseModel):
    new_status: ArchiveRequestStatus
    comment: str | None = None


class ClarificationRequest(BaseModel):
    comment: str

    @field_validator("comment")
    @classmethod
    def comment_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Comment cannot be empty")
        return v.strip()


class ClarificationResponse(BaseModel):
    comment: str | None = None


class AssigneeRequest(BaseModel):
    genealogist_user_id: UUID


class ArchiveRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    created_by_user_id: UUID
    assigned_genealogist_user_id: UUID | None
    template_id: UUID | None
    title: str
    request_goal: str | None
    processing_comment: str | None
    result_summary: str | None
    found_information: str | None
    result_sources: str | None
    result_recommendations: str | None
    result_status: str | None
    result_persons: list[dict]
    result_facts: list[dict]
    result_relationships: list[dict]
    result_document_links: list[dict]
    current_status: ArchiveRequestStatus
    outgoing_number: str | None
    sent_at: datetime | None
    due_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class StatusHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    archive_request_id: UUID
    from_status: ArchiveRequestStatus | None
    to_status: ArchiveRequestStatus
    changed_by_user_id: UUID | None
    comment: str | None
    created_at: datetime
