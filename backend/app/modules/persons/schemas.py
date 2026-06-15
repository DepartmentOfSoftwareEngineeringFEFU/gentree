from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import PersonSex


class PersonCreate(BaseModel):
    last_name: str
    first_name: str
    middle_name: str | None = None
    maiden_name: str | None = None
    sex: PersonSex = PersonSex.UNKNOWN
    birth_date: date | None = None
    death_date: date | None = None
    birth_place: str | None = None
    death_place: str | None = None
    notes: str | None = None
    is_living: bool = True

    @field_validator("death_date")
    @classmethod
    def death_after_birth(cls, death: date | None, info) -> date | None:
        birth = info.data.get("birth_date")
        if death and birth and death < birth:
            raise ValueError("Death date cannot be before birth date")
        return death


class PersonUpdate(BaseModel):
    last_name: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    maiden_name: str | None = None
    sex: PersonSex | None = None
    birth_date: date | None = None
    death_date: date | None = None
    birth_place: str | None = None
    death_place: str | None = None
    notes: str | None = None
    is_living: bool | None = None


class PersonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    last_name: str
    first_name: str
    middle_name: str | None
    maiden_name: str | None
    sex: PersonSex
    birth_date: date | None
    death_date: date | None
    birth_place: str | None
    death_place: str | None
    notes: str | None
    is_living: bool
    photo_url: str | None
    created_at: datetime
    updated_at: datetime
