from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.archive_request import (
    ArchiveRequest,
    ArchiveRequestTemplate,
    ArchiveRequestTemplateAttachment,
    ArchiveRequestTemplateBlock,
    ArchiveRequestTemplateField,
    FieldDictionary,
)
from app.models.enums import (
    ArchiveTemplateBlockType,
    ArchiveTemplateType,
    TemplateFieldCategory,
)
from app.models.user import User
from app.modules.templates.schemas import (
    ArchiveTemplateCreate,
    ArchiveTemplateListRead,
    ArchiveTemplateUpdate,
    FieldDictionaryCreate,
)

_VARIABLE_RE = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")
_CODE_RE = re.compile(r"^[a-z][a-z0-9_]*$")
_CYR_TO_LAT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ы": "y", "э": "e", "ю": "yu", "я": "ya",
}


class TemplateService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_templates(
        self,
        template_type: ArchiveTemplateType | None = None,
        status_filter: str | None = None,
        search: str | None = None,
    ) -> list[ArchiveTemplateListRead]:
        fields_subq = (
            select(
                ArchiveRequestTemplateField.template_id.label("template_id"),
                func.count(ArchiveRequestTemplateField.id).label("fields_count"),
            )
            .group_by(ArchiveRequestTemplateField.template_id)
            .subquery()
        )
        blocks_subq = (
            select(
                ArchiveRequestTemplateBlock.template_id.label("template_id"),
                func.count(ArchiveRequestTemplateBlock.id).label("blocks_count"),
            )
            .where(ArchiveRequestTemplateBlock.is_active.is_(True))
            .group_by(ArchiveRequestTemplateBlock.template_id)
            .subquery()
        )
        stmt = (
            select(
                ArchiveRequestTemplate,
                func.coalesce(fields_subq.c.fields_count, 0),
                func.coalesce(blocks_subq.c.blocks_count, 0),
            )
            .outerjoin(fields_subq, fields_subq.c.template_id == ArchiveRequestTemplate.id)
            .outerjoin(blocks_subq, blocks_subq.c.template_id == ArchiveRequestTemplate.id)
            .where(ArchiveRequestTemplate.deleted_at.is_(None))
            .order_by(ArchiveRequestTemplate.updated_at.desc(), ArchiveRequestTemplate.created_at.desc())
        )
        if template_type:
            stmt = stmt.where(ArchiveRequestTemplate.template_type == template_type)
        if status_filter == "ACTIVE":
            stmt = stmt.where(ArchiveRequestTemplate.is_active.is_(True))
        elif status_filter == "DISABLED":
            stmt = stmt.where(ArchiveRequestTemplate.is_active.is_(False))
        if search:
            stmt = stmt.where(ArchiveRequestTemplate.name.ilike(f"%{search.strip()}%"))

        result = await self.db.execute(stmt)
        return [
            ArchiveTemplateListRead(
                id=template.id,
                name=template.name,
                template_type=template.template_type,
                description=template.description,
                version=template.version,
                is_active=template.is_active,
                fields_count=fields_count,
                blocks_count=blocks_count,
                created_at=template.created_at,
                updated_at=template.updated_at,
            )
            for template, fields_count, blocks_count in result.all()
        ]

    async def get_template(self, template_id: UUID) -> ArchiveRequestTemplate:
        template = await self._get_template(template_id)
        if template.deleted_at:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        return template

    async def create_template(
        self, data: ArchiveTemplateCreate, current_user: User
    ) -> ArchiveRequestTemplate:
        field_map = await self._validate_payload(data.fields, data.blocks)
        template = ArchiveRequestTemplate(
            name=await self._unique_template_name(data.name),
            template_type=data.template_type,
            description=data.description,
            version=1,
            storage_path=None,
            is_active=data.is_active,
            created_by_user_id=current_user.id,
        )
        self.db.add(template)
        await self.db.flush()
        self._replace_children(template, data, field_map)
        return await self._commit_template(template)

    async def update_template(
        self, template_id: UUID, data: ArchiveTemplateUpdate
    ) -> ArchiveRequestTemplate:
        template = await self.get_template(template_id)
        field_map = await self._validate_payload(data.fields, data.blocks)

        template.name = await self._unique_template_name(data.name, template_id)
        template.template_type = data.template_type
        template.description = data.description
        template.is_active = data.is_active
        template.updated_at = datetime.now(UTC)
        template.fields.clear()
        template.blocks.clear()
        template.attachments.clear()
        await self.db.flush()
        self._replace_children(template, data, field_map)
        return await self._commit_template(template)

    async def toggle_template(self, template_id: UUID) -> ArchiveRequestTemplate:
        template = await self.get_template(template_id)
        template.is_active = not template.is_active
        template.updated_at = datetime.now(UTC)
        return await self._commit_template(template)

    async def duplicate_template(self, template_id: UUID, current_user: User) -> ArchiveRequestTemplate:
        source = await self.get_template(template_id)
        name = await self._unique_template_name(f"{source.name} копия")
        duplicate = ArchiveRequestTemplate(
            name=name,
            template_type=source.template_type,
            description=source.description,
            version=1,
            storage_path=None,
            is_active=False,
            created_by_user_id=current_user.id,
        )
        self.db.add(duplicate)
        await self.db.flush()
        for item in source.fields:
            self.db.add(
                ArchiveRequestTemplateField(
                    template_id=duplicate.id,
                    field_id=item.field_id,
                    is_required=item.is_required,
                    autofill_enabled=item.autofill_enabled,
                    is_visible_to_genealogist=item.is_visible_to_genealogist,
                    sort_order=item.sort_order,
                    hint=item.hint,
                    default_value=item.default_value,
                    editable_after_autofill=item.editable_after_autofill,
                )
            )
        for block in source.blocks:
            self.db.add(
                ArchiveRequestTemplateBlock(
                    template_id=duplicate.id,
                    block_type=block.block_type,
                    title=block.title,
                    content=block.content,
                    sort_order=block.sort_order,
                    is_required=block.is_required,
                    is_active=block.is_active,
                )
            )
        for attachment in source.attachments:
            self.db.add(
                ArchiveRequestTemplateAttachment(
                    template_id=duplicate.id,
                    title=attachment.title,
                    description=attachment.description,
                    is_required=attachment.is_required,
                    sort_order=attachment.sort_order,
                )
            )
        return await self._commit_template(duplicate)

    async def delete_template(self, template_id: UUID) -> tuple[bool, bool]:
        template = await self.get_template(template_id)
        used = await self.db.scalar(
            select(ArchiveRequest.id).where(ArchiveRequest.template_id == template_id).limit(1)
        )
        if used:
            template.is_active = False
            template.deleted_at = datetime.now(UTC)
            template.updated_at = datetime.now(UTC)
            await self.db.commit()
            return False, True

        await self.db.delete(template)
        await self.db.commit()
        return True, False

    async def list_fields(
        self,
        search: str | None = None,
        category: TemplateFieldCategory | None = None,
    ) -> list[FieldDictionary]:
        stmt = select(FieldDictionary).order_by(FieldDictionary.category, FieldDictionary.title)
        if category:
            stmt = stmt.where(FieldDictionary.category == category)
        if search:
            term = search.strip()
            stmt = stmt.where(
                FieldDictionary.title.ilike(f"%{term}%") | FieldDictionary.code.ilike(f"%{term}%")
            )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_field(self, data: FieldDictionaryCreate) -> FieldDictionary:
        code = self._normalize_code(data.code or self._make_code(data.title))
        if not _CODE_RE.match(code):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Field code must start with a latin letter and contain only latin letters, digits and underscores",
            )
        existing = await self.db.scalar(select(FieldDictionary.id).where(FieldDictionary.code == code))
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Field with this code already exists",
            )
        field = FieldDictionary(
            code=code,
            title=data.title,
            description=data.description,
            data_type=data.data_type,
            category=data.category,
            autofill_source=data.autofill_source,
            is_system=False,
        )
        self.db.add(field)
        await self.db.commit()
        await self.db.refresh(field)
        return field

    async def _get_template(self, template_id: UUID) -> ArchiveRequestTemplate:
        result = await self.db.execute(
            select(ArchiveRequestTemplate)
            .options(
                selectinload(ArchiveRequestTemplate.fields).selectinload(
                    ArchiveRequestTemplateField.field
                ),
                selectinload(ArchiveRequestTemplate.blocks),
                selectinload(ArchiveRequestTemplate.attachments),
            )
            .where(ArchiveRequestTemplate.id == template_id)
        )
        template = result.scalar_one_or_none()
        if not template:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        return template

    async def _validate_payload(
        self,
        fields: list,
        blocks: list,
    ) -> dict[UUID, FieldDictionary]:
        if not any(block.block_type == ArchiveTemplateBlockType.BODY and block.is_active for block in blocks):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Template must contain at least one active BODY block",
            )

        field_ids = [item.field_id for item in fields]
        if len(field_ids) != len(set(field_ids)):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Template contains duplicate fields",
            )

        field_map: dict[UUID, FieldDictionary] = {}
        if field_ids:
            result = await self.db.execute(
                select(FieldDictionary).where(FieldDictionary.id.in_(field_ids))
            )
            loaded = list(result.scalars().all())
            field_map = {field.id: field for field in loaded}
        if len(field_map) != len(field_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="One or more fields were not found",
            )

        field_codes = {field.code for field in field_map.values()}
        unknown_variables: set[str] = set()
        for block in blocks:
            unknown_variables.update(
                code for code in _VARIABLE_RE.findall(block.content or "") if code not in field_codes
            )
        if unknown_variables:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown variables in blocks: {', '.join(sorted(unknown_variables))}",
            )
        return field_map

    def _replace_children(
        self,
        template: ArchiveRequestTemplate,
        data: ArchiveTemplateCreate | ArchiveTemplateUpdate,
        field_map: dict[UUID, FieldDictionary],
    ) -> None:
        for index, item in enumerate(data.fields):
            self.db.add(
                ArchiveRequestTemplateField(
                    template_id=template.id,
                    field_id=item.field_id,
                    field=field_map[item.field_id],
                    is_required=item.is_required,
                    autofill_enabled=item.autofill_enabled,
                    is_visible_to_genealogist=item.is_visible_to_genealogist,
                    sort_order=item.sort_order if item.sort_order is not None else index,
                    hint=item.hint,
                    default_value=item.default_value,
                    editable_after_autofill=item.editable_after_autofill,
                )
            )
        for index, block in enumerate(data.blocks):
            self.db.add(
                ArchiveRequestTemplateBlock(
                    template_id=template.id,
                    block_type=block.block_type,
                    title=block.title,
                    content=block.content,
                    sort_order=block.sort_order if block.sort_order is not None else index,
                    is_required=block.is_required,
                    is_active=block.is_active,
                )
            )
        for index, attachment in enumerate(data.attachments):
            self.db.add(
                ArchiveRequestTemplateAttachment(
                    template_id=template.id,
                    title=attachment.title,
                    description=attachment.description,
                    is_required=attachment.is_required,
                    sort_order=attachment.sort_order if attachment.sort_order is not None else index,
                )
            )

    async def _commit_template(self, template: ArchiveRequestTemplate) -> ArchiveRequestTemplate:
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Template with this name and version already exists",
            ) from exc
        return await self._get_template(template.id)

    async def _unique_template_name(self, base_name: str, current_id: UUID | None = None) -> str:
        base_name = base_name.strip()
        name = base_name
        suffix = 2
        while True:
            stmt = select(ArchiveRequestTemplate.id).where(
                ArchiveRequestTemplate.name == name,
                ArchiveRequestTemplate.version == 1,
                ArchiveRequestTemplate.deleted_at.is_(None),
            )
            if current_id:
                stmt = stmt.where(ArchiveRequestTemplate.id != current_id)
            existing = await self.db.scalar(stmt)
            if not existing:
                return name
            name = f"{base_name} {suffix}"
            suffix += 1

    def _make_code(self, title: str) -> str:
        lowered = title.strip().lower()
        transliterated = "".join(_CYR_TO_LAT.get(ch, ch) for ch in lowered if ch not in "ьъ")
        code = re.sub(r"[^a-z0-9]+", "_", transliterated)
        code = re.sub(r"_+", "_", code).strip("_")
        if not code or not code[0].isalpha():
            code = f"field_{uuid.uuid4().hex[:8]}"
        return code

    def _normalize_code(self, code: str) -> str:
        return re.sub(r"_+", "_", code.strip().lower()).strip("_")
