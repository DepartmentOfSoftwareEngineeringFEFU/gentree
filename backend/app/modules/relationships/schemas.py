from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import PersonSex, RelationshipType


class RelationshipCreate(BaseModel):
    source_person_id: UUID
    target_person_id: UUID
    relationship_type: RelationshipType
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None
    layout_as: str | None = None

    @model_validator(mode="after")
    def persons_differ(self) -> "RelationshipCreate":
        if self.source_person_id == self.target_person_id:
            raise ValueError("source_person_id and target_person_id must be different")
        return self


class RelationshipUpdate(BaseModel):
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


class RelationshipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile_id: UUID
    source_person_id: UUID
    target_person_id: UUID
    relationship_type: RelationshipType
    start_date: date | None
    end_date: date | None
    notes: str | None
    layout_as: str | None
    created_at: datetime
    updated_at: datetime


# --- Tree DTOs ---

class TreeNode(BaseModel):
    id: UUID
    last_name: str
    first_name: str
    middle_name: str | None
    sex: PersonSex
    is_living: bool
    birth_date: date | None
    death_date: date | None
    photo_url: str | None
    created_at: datetime


class TreeEdge(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_person_id: UUID
    target_person_id: UUID
    relationship_type: RelationshipType
    start_date: date | None
    end_date: date | None
    notes: str | None
    layout_as: str | None
    created_at: datetime


class TreeResponse(BaseModel):
    profile_id: UUID
    nodes: list[TreeNode]
    edges: list[TreeEdge]
