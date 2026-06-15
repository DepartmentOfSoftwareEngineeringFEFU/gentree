from __future__ import annotations

import re
from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.archive_request import (
    ArchiveRequest,
    ArchiveRequestTemplate,
    ArchiveRequestTemplateAttachment,
    ArchiveRequestTemplateBlock,
    ArchiveRequestTemplateField,
    GeneratedArchiveRequest,
)
from app.models.document import ArchiveRequestDocument, Document, PersonDocument
from app.models.enums import (
    ArchiveTemplateBlockType,
    FactType,
    GeneratedArchiveRequestStatus,
    RelationshipType,
    UserRole,
)
from app.models.fact import Fact
from app.models.profile import Person, Profile, ProfilePerson, Relationship
from app.models.user import User
from app.modules.generated_requests.schemas import (
    ActiveTemplateSummary,
    AvailableAttachmentRead,
    GeneratedFieldValue,
)

_VARIABLE_RE = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")


class GeneratedArchiveRequestService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_active_templates(self, user: User) -> list[ActiveTemplateSummary]:
        self._assert_genealogist(user)
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
        attachments_subq = (
            select(
                ArchiveRequestTemplateAttachment.template_id.label("template_id"),
                func.bool_or(ArchiveRequestTemplateAttachment.is_required).label(
                    "has_required_attachments"
                ),
            )
            .group_by(ArchiveRequestTemplateAttachment.template_id)
            .subquery()
        )
        result = await self.db.execute(
            select(
                ArchiveRequestTemplate,
                func.coalesce(fields_subq.c.fields_count, 0),
                func.coalesce(blocks_subq.c.blocks_count, 0),
                func.coalesce(attachments_subq.c.has_required_attachments, False),
            )
            .outerjoin(fields_subq, fields_subq.c.template_id == ArchiveRequestTemplate.id)
            .outerjoin(blocks_subq, blocks_subq.c.template_id == ArchiveRequestTemplate.id)
            .outerjoin(attachments_subq, attachments_subq.c.template_id == ArchiveRequestTemplate.id)
            .where(
                ArchiveRequestTemplate.is_active.is_(True),
                ArchiveRequestTemplate.deleted_at.is_(None),
            )
            .order_by(ArchiveRequestTemplate.updated_at.desc())
        )
        return [
            ActiveTemplateSummary(
                id=template.id,
                name=template.name,
                template_type=template.template_type,
                description=template.description,
                fields_count=fields_count,
                blocks_count=blocks_count,
                has_required_attachments=bool(has_required_attachments),
                updated_at=template.updated_at,
            )
            for template, fields_count, blocks_count, has_required_attachments in result.all()
        ]

    async def list_by_archive_request(
        self, archive_request_id: UUID, user: User
    ) -> list[GeneratedArchiveRequest]:
        await self._get_assigned_request(archive_request_id, user)
        result = await self.db.execute(
            select(GeneratedArchiveRequest)
            .where(GeneratedArchiveRequest.source_archive_request_id == archive_request_id)
            .order_by(GeneratedArchiveRequest.created_at.desc())
        )
        return list(result.scalars().all())

    async def start(
        self, archive_request_id: UUID, template_id: UUID, user: User
    ) -> GeneratedArchiveRequest:
        archive_request = await self._get_assigned_request(archive_request_id, user)
        template = await self._get_template(template_id)
        if not template.is_active or template.deleted_at:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot use inactive template",
            )
        field_values = await self._build_initial_field_values(template, archive_request)
        generated_blocks, final_text = self._build_document(template, field_values)
        generated = GeneratedArchiveRequest(
            source_archive_request_id=archive_request.id,
            genealogist_id=user.id,
            template_id=template.id,
            template_title_snapshot=template.name,
            template_type_snapshot=template.template_type.value,
            user_original_request_text=archive_request.request_goal,
            field_values=field_values,
            generated_blocks=generated_blocks,
            final_document_text=final_text,
            attached_document_ids=[],
            status=GeneratedArchiveRequestStatus.DRAFT,
        )
        self.db.add(generated)
        await self.db.commit()
        return await self.get(generated.id, user)

    async def get(self, generated_id: UUID, user: User) -> GeneratedArchiveRequest:
        generated = await self._get_generated(generated_id)
        await self._get_assigned_request(generated.source_archive_request_id, user)
        return generated

    async def update_fields(
        self, generated_id: UUID, field_values: dict, user: User
    ) -> GeneratedArchiveRequest:
        generated = await self.get(generated_id, user)
        generated.field_values = field_values
        template = await self._get_template(generated.template_id)
        generated.generated_blocks, generated.final_document_text = self._build_document(template, field_values)
        generated.updated_at = datetime.now(UTC)
        await self.db.commit()
        return await self.get(generated.id, user)

    async def update_final_text(
        self, generated_id: UUID, final_document_text: str, user: User
    ) -> GeneratedArchiveRequest:
        generated = await self.get(generated_id, user)
        generated.final_document_text = final_document_text
        generated.updated_at = datetime.now(UTC)
        await self.db.commit()
        return await self.get(generated.id, user)

    async def update_attachments(
        self, generated_id: UUID, attached_document_ids: list[UUID], user: User
    ) -> GeneratedArchiveRequest:
        generated = await self.get(generated_id, user)
        available_ids = {doc.id for doc in await self.available_attachments(generated.id, user)}
        invalid = [doc_id for doc_id in attached_document_ids if doc_id not in available_ids]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="One or more selected documents are not available for this request",
            )
        generated.attached_document_ids = [str(doc_id) for doc_id in attached_document_ids]
        generated.updated_at = datetime.now(UTC)
        await self.db.commit()
        return await self.get(generated.id, user)

    async def update_comment(
        self, generated_id: UUID, context_comment: str | None, user: User
    ) -> GeneratedArchiveRequest:
        generated = await self.get(generated_id, user)
        generated.context_comment = context_comment
        generated.updated_at = datetime.now(UTC)
        await self.db.commit()
        return await self.get(generated.id, user)

    async def preview(self, generated_id: UUID, user: User) -> tuple[list[dict], str, list[str]]:
        generated = await self.get(generated_id, user)
        template = await self._get_template(generated.template_id)
        blocks, text = self._build_document(template, generated.field_values)
        missing = self._missing_required_field_codes(template, generated.field_values)
        return blocks, generated.final_document_text or text, missing

    async def export(self, generated_id: UUID, user: User) -> GeneratedArchiveRequest:
        generated = await self.get(generated_id, user)
        template = await self._get_template(generated.template_id)
        missing = self._missing_required_field_codes(template, generated.field_values)
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Required fields are empty: {', '.join(missing)}",
            )
        if not generated.final_document_text:
            generated.generated_blocks, generated.final_document_text = self._build_document(
                template, generated.field_values
            )
        generated.status = GeneratedArchiveRequestStatus.EXPORTED
        generated.exported_at = datetime.now(UTC)
        generated.updated_at = datetime.now(UTC)
        await self.db.commit()
        return await self.get(generated.id, user)

    async def save_draft(self, generated_id: UUID, user: User) -> GeneratedArchiveRequest:
        generated = await self.get(generated_id, user)
        generated.status = GeneratedArchiveRequestStatus.DRAFT
        generated.updated_at = datetime.now(UTC)
        await self.db.commit()
        return await self.get(generated.id, user)

    async def update_status(
        self, generated_id: UUID, new_status: GeneratedArchiveRequestStatus, user: User
    ) -> GeneratedArchiveRequest:
        generated = await self.get(generated_id, user)
        template = await self._get_template(generated.template_id)
        if new_status == GeneratedArchiveRequestStatus.PREPARED:
            missing = self._missing_required_field_codes(template, generated.field_values)
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Required fields are empty: {', '.join(missing)}",
                )
            if not generated.final_document_text:
                generated.generated_blocks, generated.final_document_text = self._build_document(
                    template, generated.field_values
                )
        if new_status == GeneratedArchiveRequestStatus.SENT_OUTSIDE_SYSTEM:
            if generated.status not in (
                GeneratedArchiveRequestStatus.PREPARED,
                GeneratedArchiveRequestStatus.EXPORTED,
                GeneratedArchiveRequestStatus.SENT_OUTSIDE_SYSTEM,
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Request can be marked as sent only after preparation or export",
                )
            if not generated.sent_at:
                generated.sent_at = datetime.now(UTC)
        generated.status = new_status
        generated.updated_at = datetime.now(UTC)
        if new_status == GeneratedArchiveRequestStatus.EXPORTED and not generated.exported_at:
            generated.exported_at = datetime.now(UTC)
        await self.db.commit()
        return await self.get(generated.id, user)

    async def available_attachments(
        self, generated_id: UUID, user: User
    ) -> list[AvailableAttachmentRead]:
        generated = await self.get(generated_id, user)
        archive_request = await self._get_assigned_request(generated.source_archive_request_id, user)

        request_docs = await self.db.execute(
            select(Document, ArchiveRequestDocument.relation_type)
            .join(ArchiveRequestDocument, ArchiveRequestDocument.document_id == Document.id)
            .where(ArchiveRequestDocument.archive_request_id == archive_request.id)
            .order_by(Document.created_at.desc())
        )
        rows: list[AvailableAttachmentRead] = [
            AvailableAttachmentRead(
                id=doc.id,
                file_name=doc.file_name,
                document_kind=doc.document_kind.value,
                source_type=doc.source_type.value,
                created_at=doc.created_at,
                bound_to="Архивный запрос",
                comment=relation_type,
            )
            for doc, relation_type in request_docs.all()
        ]

        person_docs = await self.db.execute(
            select(Document, Person)
            .join(PersonDocument, PersonDocument.document_id == Document.id)
            .join(Person, Person.id == PersonDocument.person_id)
            .join(ProfilePerson, ProfilePerson.person_id == Person.id)
            .where(ProfilePerson.profile_id == archive_request.profile_id)
            .order_by(Document.created_at.desc())
        )
        seen = {item.id for item in rows}
        for doc, person in person_docs.all():
            if doc.id in seen:
                continue
            seen.add(doc.id)
            rows.append(
                AvailableAttachmentRead(
                    id=doc.id,
                    file_name=doc.file_name,
                    document_kind=doc.document_kind.value,
                    source_type=doc.source_type.value,
                    created_at=doc.created_at,
                    bound_to=f"Персона: {self._person_name(person)}",
                    comment=None,
                )
            )
        return rows

    async def _get_generated(self, generated_id: UUID) -> GeneratedArchiveRequest:
        result = await self.db.execute(
            select(GeneratedArchiveRequest).where(GeneratedArchiveRequest.id == generated_id)
        )
        generated = result.scalar_one_or_none()
        if not generated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated request not found")
        return generated

    async def _get_assigned_request(self, archive_request_id: UUID, user: User) -> ArchiveRequest:
        self._assert_genealogist(user)
        result = await self.db.execute(
            select(ArchiveRequest).where(ArchiveRequest.id == archive_request_id)
        )
        archive_request = result.scalar_one_or_none()
        if not archive_request:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archive request not found")
        if archive_request.assigned_genealogist_user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return archive_request

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

    async def _build_initial_field_values(
        self,
        template: ArchiveRequestTemplate,
        archive_request: ArchiveRequest,
    ) -> dict[str, dict]:
        context = await self._autofill_context(archive_request)
        field_values: dict[str, dict] = {}
        for item in template.fields:
            field = item.field
            value = context.get(field.code)
            default_value = item.default_value
            effective_value = value if value not in (None, "") else default_value
            has_autofill_source = item.autofill_enabled or field.autofill_source or field.code in context
            field_values[field.code] = GeneratedFieldValue(
                value=effective_value,
                autofilled=value not in (None, ""),
                source="profile" if value not in (None, "") else None,
                missing_autofill=bool(has_autofill_source and value in (None, "") and not default_value),
            ).model_dump(mode="json")
        return field_values

    async def _autofill_context(self, archive_request: ArchiveRequest) -> dict[str, str]:
        owner = await self.db.get(User, archive_request.created_by_user_id)
        persons_result = await self.db.execute(
            select(Person)
            .join(ProfilePerson, ProfilePerson.person_id == Person.id)
            .where(ProfilePerson.profile_id == archive_request.profile_id)
            .order_by(Person.created_at)
        )
        persons = list(persons_result.scalars().all())
        target_person = persons[0] if len(persons) == 1 else None

        context: dict[str, str] = {
            "request_purpose": archive_request.request_goal or "",
        }
        if owner:
            context.update(
                {
                    "applicant_full_name": self._user_name(owner),
                    "applicant_email": owner.email,
                    "applicant_address": owner.region or "",
                    "applicant_phone": "",
                }
            )
        if target_person:
            context.update(self._person_context(target_person))
            context.update(await self._relationship_context(archive_request.profile_id, target_person.id))
            context.update(await self._fact_context(target_person.id))
        return {key: value for key, value in context.items() if value not in (None, "")}

    def _person_context(self, person: Person) -> dict[str, str]:
        result = {
            "person_full_name": self._person_name(person),
            "birth_place": person.birth_place or "",
            "death_place": person.death_place or "",
        }
        if person.birth_date:
            result["birth_date"] = self._format_date(person.birth_date)
            result["birth_year"] = str(person.birth_date.year)
        if person.death_date:
            result["death_date"] = self._format_date(person.death_date)
        return result

    async def _relationship_context(self, profile_id: UUID, person_id: UUID) -> dict[str, str]:
        result = await self.db.execute(
            select(Relationship, Person)
            .join(
                Person,
                (Person.id == Relationship.source_person_id) | (Person.id == Relationship.target_person_id),
            )
            .where(
                Relationship.profile_id == profile_id,
                (Relationship.source_person_id == person_id) | (Relationship.target_person_id == person_id),
                Person.id != person_id,
            )
        )
        parents: list[str] = []
        spouses: list[str] = []
        for rel, person in result.all():
            if rel.relationship_type == RelationshipType.PARENT_CHILD and rel.target_person_id == person_id:
                parents.append(self._person_name(person))
            if rel.relationship_type == RelationshipType.SPOUSE:
                spouses.append(self._person_name(person))
        context = {}
        if parents:
            context["parents_full_names"] = ", ".join(parents)
        if len(spouses) == 1:
            context["spouse_full_name"] = spouses[0]
        return context

    async def _fact_context(self, person_id: UUID) -> dict[str, str]:
        result = await self.db.execute(select(Fact).where(Fact.person_id == person_id))
        facts = list(result.scalars().all())
        residence_facts = [fact for fact in facts if fact.fact_type == FactType.RESIDENCE and fact.place]
        context = {}
        if len(residence_facts) == 1:
            context["residence_place"] = residence_facts[0].place
        return context

    def _build_document(
        self,
        template: ArchiveRequestTemplate,
        field_values: dict[str, dict],
    ) -> tuple[list[dict], str]:
        fields_by_code = {item.field.code: item.field for item in template.fields}
        blocks: list[dict] = []
        text_parts: list[str] = []
        for block in sorted(template.blocks, key=lambda item: item.sort_order):
            if not block.is_active:
                continue
            content = self._render_text(block.content or "", field_values, fields_by_code)
            rendered = {
                "block_type": block.block_type.value,
                "title": block.title,
                "content": content,
                "sort_order": block.sort_order,
            }
            blocks.append(rendered)
            if block.block_type == ArchiveTemplateBlockType.TITLE:
                text_parts.append(content.upper())
            else:
                text_parts.append(content)
        return blocks, "\n\n".join(part for part in text_parts if part.strip())

    def _render_text(self, text: str, field_values: dict[str, dict], fields_by_code: dict) -> str:
        def replace(match: re.Match) -> str:
            code = match.group(1)
            value = (field_values.get(code) or {}).get("value")
            if value not in (None, ""):
                return str(value)
            field = fields_by_code.get(code)
            return f"[{field.title if field else code}]"

        return _VARIABLE_RE.sub(replace, text)

    def _missing_required_field_codes(
        self,
        template: ArchiveRequestTemplate,
        field_values: dict[str, dict],
    ) -> list[str]:
        missing = []
        for item in template.fields:
            if not item.is_required:
                continue
            value = (field_values.get(item.field.code) or {}).get("value")
            if value in (None, "", False):
                missing.append(item.field.code)
        return missing

    def _assert_genealogist(self, user: User) -> None:
        if user.role != UserRole.GENEALOGIST:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Genealogist only")

    def _user_name(self, user: User) -> str:
        return " ".join(part for part in [user.last_name, user.first_name, user.middle_name] if part) or user.email

    def _person_name(self, person: Person) -> str:
        return " ".join(part for part in [person.last_name, person.first_name, person.middle_name] if part)

    def _format_date(self, value: date) -> str:
        return value.strftime("%d.%m.%Y")
