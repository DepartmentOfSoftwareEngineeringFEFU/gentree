from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.enums import DocumentKind, DocumentSourceType


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    uploaded_by_user_id: UUID | None
    document_kind: DocumentKind
    source_type: DocumentSourceType
    archive_request_relation_type: str | None = None
    file_name: str
    mime_type: str
    file_size_bytes: int
    checksum_sha256: str | None
    created_at: datetime
