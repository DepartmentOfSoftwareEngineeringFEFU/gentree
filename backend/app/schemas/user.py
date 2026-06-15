from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.models.enums import UserRole, UserStatus


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role: UserRole
    status: UserStatus
    first_name: str | None
    last_name: str | None
    middle_name: str | None
    birth_date: date | None
    birth_place: str | None
    region: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    birth_date: date | None = None
    birth_place: str | None = None
    region: str | None = None
    notes: str | None = None


class GenealogistCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    notes: str | None = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class AdminUserUpdate(BaseModel):
    email: EmailStr | None = None
    status: UserStatus | None = None
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    notes: str | None = None
