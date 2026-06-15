from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.enums import BookStatus


class BookTone(StrEnum):
    WARM = "WARM"
    DOCUMENTARY = "DOCUMENTARY"
    CONCISE = "CONCISE"


class BookCreate(BaseModel):
    tone: BookTone = BookTone.WARM
    include_unverified: bool = True


class BookRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    requested_by_user_id: UUID
    document_id: UUID | None
    status: BookStatus
    started_at: datetime
    finished_at: datetime | None
    error_message: str | None
    created_at: datetime
