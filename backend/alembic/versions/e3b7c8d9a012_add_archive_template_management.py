"""Add archive request template management.

Revision ID: e3b7c8d9a012
Revises: c1f2a3b4d5e6
Create Date: 2026-06-15 00:00:00.000000
"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa


revision = "e3b7c8d9a012"
down_revision = "c1f2a3b4d5e6"
branch_labels = None
depends_on = None


FIELD_ROWS = [
    ("archive_name", "Название архива", "archive", "text"),
    ("archive_position", "Должность адресата", "archive", "text"),
    ("archive_director_name", "ФИО руководителя архива", "archive", "text"),
    ("applicant_full_name", "ФИО заявителя", "applicant", "text"),
    ("applicant_address", "Адрес заявителя", "applicant", "textarea"),
    ("applicant_phone", "Телефон заявителя", "applicant", "text"),
    ("applicant_email", "E-mail заявителя", "applicant", "text"),
    ("person_full_name", "ФИО разыскиваемого лица", "person", "text"),
    ("birth_date", "Дата рождения", "person", "date"),
    ("birth_year", "Год рождения", "person", "year"),
    ("birth_place", "Место рождения", "person", "text"),
    ("death_date", "Дата смерти", "person", "date"),
    ("death_place", "Место смерти", "person", "text"),
    ("parents_full_names", "ФИО родителей", "person", "textarea"),
    ("spouse_full_name", "ФИО супруга/супруги", "person", "text"),
    ("residence_place", "Место проживания", "residence", "text"),
    ("event_type", "Тип события", "document", "text"),
    ("search_period", "Период поиска", "document", "text"),
    ("historical_place_name", "Историческое название населенного пункта", "residence", "text"),
    ("religion", "Вероисповедание", "person", "text"),
    ("social_class", "Сословие", "person", "text"),
    ("occupation", "Род занятий", "person", "text"),
    ("military_rank", "Воинское звание", "military", "text"),
    ("military_unit", "Воинская часть", "military", "text"),
    ("draft_place", "Место призыва", "military", "text"),
    ("service_period", "Период службы", "military", "text"),
    ("medical_institution", "Медицинское учреждение", "medical", "text"),
    ("employer_name", "Название организации", "document", "text"),
    ("work_period", "Период работы", "document", "text"),
    ("property_address", "Адрес объекта", "residence", "text"),
    ("request_purpose", "Цель запроса", "document", "textarea"),
    ("requested_result_type", "Тип запрашиваемого результата", "document", "text"),
]


def field_id(code: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"gentree.field.{code}")


def template_id(code: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"gentree.template.{code}")


def upgrade() -> None:
    op.add_column(
        "archive_request_templates",
        sa.Column("template_type", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "archive_request_templates",
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.add_column(
        "archive_request_templates",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE archive_request_templates SET template_type = 'CUSTOM' WHERE template_type IS NULL")
    op.execute("UPDATE archive_request_templates SET updated_at = created_at WHERE updated_at IS NULL")
    op.alter_column("archive_request_templates", "template_type", nullable=False)
    op.alter_column("archive_request_templates", "updated_at", nullable=False)
    op.alter_column("archive_request_templates", "storage_path", existing_type=sa.String(length=500), nullable=True)

    op.create_table(
        "field_dictionary",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("data_type", sa.String(length=50), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("autofill_source", sa.String(length=255), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_field_dictionary_code"),
    )
    op.create_index(op.f("ix_field_dictionary_code"), "field_dictionary", ["code"], unique=True)

    op.create_table(
        "archive_request_template_fields",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=False),
        sa.Column("field_id", sa.UUID(), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False),
        sa.Column("autofill_enabled", sa.Boolean(), nullable=False),
        sa.Column("is_visible_to_genealogist", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("hint", sa.Text(), nullable=True),
        sa.Column("default_value", sa.Text(), nullable=True),
        sa.Column("editable_after_autofill", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["field_id"], ["field_dictionary.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["template_id"], ["archive_request_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_id", "field_id", name="uq_archive_request_template_fields_field"),
    )
    op.create_index(op.f("ix_archive_request_template_fields_field_id"), "archive_request_template_fields", ["field_id"])
    op.create_index(op.f("ix_archive_request_template_fields_template_id"), "archive_request_template_fields", ["template_id"])

    op.create_table(
        "archive_request_template_blocks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=False),
        sa.Column("block_type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["archive_request_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_archive_request_template_blocks_template_id"), "archive_request_template_blocks", ["template_id"])

    op.create_table(
        "archive_request_template_attachments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_required", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["archive_request_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_archive_request_template_attachments_template_id"), "archive_request_template_attachments", ["template_id"])

    field_table = sa.table(
        "field_dictionary",
        sa.column("id", sa.UUID()),
        sa.column("code", sa.String),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("data_type", sa.String),
        sa.column("category", sa.String),
        sa.column("autofill_source", sa.String),
        sa.column("is_system", sa.Boolean),
    )
    op.bulk_insert(
        field_table,
        [
            {
                "id": field_id(code),
                "code": code,
                "title": title,
                "description": None,
                "data_type": data_type,
                "category": category,
                "autofill_source": None,
                "is_system": True,
            }
            for code, title, category, data_type in FIELD_ROWS
        ],
    )

    admin_id = op.get_bind().execute(
        sa.text("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1")
    ).scalar()
    if admin_id is not None:
        seed_templates(str(admin_id))


def seed_templates(admin_id: str) -> None:
    template_table = sa.table(
        "archive_request_templates",
        sa.column("id", sa.UUID()),
        sa.column("name", sa.String),
        sa.column("template_type", sa.String),
        sa.column("description", sa.Text),
        sa.column("version", sa.Integer),
        sa.column("storage_path", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("created_by_user_id", sa.UUID()),
    )
    link_table = sa.table(
        "archive_request_template_fields",
        sa.column("id", sa.UUID()),
        sa.column("template_id", sa.UUID()),
        sa.column("field_id", sa.UUID()),
        sa.column("is_required", sa.Boolean),
        sa.column("autofill_enabled", sa.Boolean),
        sa.column("is_visible_to_genealogist", sa.Boolean),
        sa.column("sort_order", sa.Integer),
        sa.column("hint", sa.Text),
        sa.column("default_value", sa.Text),
        sa.column("editable_after_autofill", sa.Boolean),
    )
    block_table = sa.table(
        "archive_request_template_blocks",
        sa.column("id", sa.UUID()),
        sa.column("template_id", sa.UUID()),
        sa.column("block_type", sa.String),
        sa.column("title", sa.String),
        sa.column("content", sa.Text),
        sa.column("sort_order", sa.Integer),
        sa.column("is_required", sa.Boolean),
        sa.column("is_active", sa.Boolean),
    )
    attachment_table = sa.table(
        "archive_request_template_attachments",
        sa.column("id", sa.UUID()),
        sa.column("template_id", sa.UUID()),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("is_required", sa.Boolean),
        sa.column("sort_order", sa.Integer),
    )

    templates = [
        (
            "general_archive",
            "Генеалогический запрос в государственный архив",
            "GENERAL_ARCHIVE",
            "Базовый запрос о поиске метрических, исповедных и иных архивных сведений.",
            ["archive_name", "archive_position", "archive_director_name", "applicant_full_name", "applicant_address", "person_full_name", "birth_year", "birth_place", "parents_full_names", "search_period", "request_purpose"],
            [
                ("HEADER_RIGHT", "Адресат", "{{archive_position}}\n{{archive_director_name}}\n{{archive_name}}"),
                ("TITLE", "Заголовок", "Запрос о предоставлении архивных сведений"),
                ("BODY", "Основной текст", "Прошу провести поиск сведений о {{person_full_name}}, родившемся(ейся) около {{birth_year}} в {{birth_place}}. Известные родственники: {{parents_full_names}}. Период поиска: {{search_period}}. Цель запроса: {{request_purpose}}."),
                ("ATTACHMENTS", "Приложения", "Перечень приложений указан ниже."),
                ("FOOTER", "Подпись", "Заявитель: {{applicant_full_name}}\nАдрес: {{applicant_address}}"),
            ],
            [("Документ, подтверждающий родство", True), ("Копия паспорта", False), ("Дополнительные архивные материалы", False)],
        ),
        (
            "military_service",
            "Запрос сведений о военной службе",
            "MILITARY_ARCHIVE",
            "Запрос о прохождении военной службы, призыве, воинской части и звании.",
            ["archive_name", "applicant_full_name", "applicant_address", "person_full_name", "birth_year", "birth_place", "military_rank", "military_unit", "draft_place", "service_period", "request_purpose"],
            [
                ("HEADER_RIGHT", "Адресат", "{{archive_name}}"),
                ("TITLE", "Заголовок", "Запрос сведений о военной службе"),
                ("BODY", "Основной текст", "Прошу предоставить сведения о прохождении военной службы {{person_full_name}}, год рождения {{birth_year}}, место рождения {{birth_place}}. Известные данные: звание {{military_rank}}, часть {{military_unit}}, место призыва {{draft_place}}, период службы {{service_period}}. Цель запроса: {{request_purpose}}."),
                ("FOOTER", "Подпись", "{{applicant_full_name}}\n{{applicant_address}}"),
            ],
            [("Документ, подтверждающий родство", True), ("Дополнительные сведения о службе", False)],
        ),
        (
            "civil_registry",
            "Запрос актовой записи в ЗАГС",
            "CIVIL_REGISTRY",
            "Запрос копии или справки по актовой записи о рождении, браке или смерти.",
            ["archive_name", "applicant_full_name", "applicant_address", "person_full_name", "birth_date", "birth_place", "death_date", "death_place", "event_type", "requested_result_type"],
            [
                ("HEADER_RIGHT", "Адресат", "{{archive_name}}"),
                ("TITLE", "Заголовок", "Запрос актовой записи"),
                ("BODY", "Основной текст", "Прошу предоставить {{requested_result_type}} по событию: {{event_type}}. Лицо: {{person_full_name}}. Дата и место рождения: {{birth_date}}, {{birth_place}}. Дата и место смерти при наличии: {{death_date}}, {{death_place}}."),
                ("FOOTER", "Подпись", "{{applicant_full_name}}\n{{applicant_address}}"),
            ],
            [("Документ, подтверждающий родство", True), ("Копия паспорта заявителя", True), ("Доверенность", False)],
        ),
        (
            "medical_birth",
            "Запрос сведений о рождении в медицинскую организацию",
            "MEDICAL_ARCHIVE",
            "Запрос сведений о рождении в медицинской организации или роддоме.",
            ["medical_institution", "applicant_full_name", "applicant_address", "person_full_name", "birth_date", "birth_place", "parents_full_names", "requested_result_type"],
            [
                ("HEADER_RIGHT", "Адресат", "{{medical_institution}}"),
                ("TITLE", "Заголовок", "Запрос сведений о рождении"),
                ("BODY", "Основной текст", "Прошу предоставить {{requested_result_type}} о рождении {{person_full_name}}, дата рождения {{birth_date}}, место рождения {{birth_place}}. Родители: {{parents_full_names}}."),
                ("FOOTER", "Подпись", "{{applicant_full_name}}\n{{applicant_address}}"),
            ],
            [("Документ, подтверждающий родство", True), ("Копия паспорта", True)],
        ),
    ]

    for template_code, name, template_type, description, field_codes, blocks, attachments in templates:
        tid = template_id(template_code)
        op.bulk_insert(template_table, [{
            "id": tid,
            "name": name,
            "template_type": template_type,
            "description": description,
            "version": 1,
            "storage_path": None,
            "is_active": True,
            "created_by_user_id": uuid.UUID(admin_id),
        }])
        op.bulk_insert(link_table, [
            {
                "id": uuid.uuid5(uuid.NAMESPACE_URL, f"gentree.template_field.{template_code}.{code}"),
                "template_id": tid,
                "field_id": field_id(code),
                "is_required": code in {"archive_name", "applicant_full_name", "person_full_name"},
                "autofill_enabled": code.startswith("applicant_"),
                "is_visible_to_genealogist": True,
                "sort_order": index,
                "hint": None,
                "default_value": None,
                "editable_after_autofill": True,
            }
            for index, code in enumerate(field_codes)
        ])
        op.bulk_insert(block_table, [
            {
                "id": uuid.uuid5(uuid.NAMESPACE_URL, f"gentree.template_block.{template_code}.{index}"),
                "template_id": tid,
                "block_type": block_type,
                "title": title,
                "content": content,
                "sort_order": index,
                "is_required": block_type == "BODY",
                "is_active": True,
            }
            for index, (block_type, title, content) in enumerate(blocks)
        ])
        op.bulk_insert(attachment_table, [
            {
                "id": uuid.uuid5(uuid.NAMESPACE_URL, f"gentree.template_attachment.{template_code}.{index}"),
                "template_id": tid,
                "title": title,
                "description": None,
                "is_required": is_required,
                "sort_order": index,
            }
            for index, (title, is_required) in enumerate(attachments)
        ])


def downgrade() -> None:
    op.drop_index(op.f("ix_archive_request_template_attachments_template_id"), table_name="archive_request_template_attachments")
    op.drop_table("archive_request_template_attachments")
    op.drop_index(op.f("ix_archive_request_template_blocks_template_id"), table_name="archive_request_template_blocks")
    op.drop_table("archive_request_template_blocks")
    op.drop_index(op.f("ix_archive_request_template_fields_template_id"), table_name="archive_request_template_fields")
    op.drop_index(op.f("ix_archive_request_template_fields_field_id"), table_name="archive_request_template_fields")
    op.drop_table("archive_request_template_fields")
    op.drop_index(op.f("ix_field_dictionary_code"), table_name="field_dictionary")
    op.drop_table("field_dictionary")
    op.drop_column("archive_request_templates", "deleted_at")
    op.drop_column("archive_request_templates", "updated_at")
    op.drop_column("archive_request_templates", "template_type")
    op.alter_column("archive_request_templates", "storage_path", existing_type=sa.String(length=500), nullable=False)
