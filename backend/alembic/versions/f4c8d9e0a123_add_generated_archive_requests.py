"""Add generated archive requests.

Revision ID: f4c8d9e0a123
Revises: e3b7c8d9a012
Create Date: 2026-06-15 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "f4c8d9e0a123"
down_revision = "e3b7c8d9a012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "generated_archive_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("source_archive_request_id", sa.UUID(), nullable=False),
        sa.Column("genealogist_id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=False),
        sa.Column("template_title_snapshot", sa.String(length=255), nullable=False),
        sa.Column("template_type_snapshot", sa.String(length=50), nullable=False),
        sa.Column("user_original_request_text", sa.Text(), nullable=True),
        sa.Column("context_comment", sa.Text(), nullable=True),
        sa.Column("field_values", sa.JSON(), nullable=False),
        sa.Column("generated_blocks", sa.JSON(), nullable=False),
        sa.Column("final_document_text", sa.Text(), nullable=True),
        sa.Column("attached_document_ids", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("exported_docx_url", sa.String(length=500), nullable=True),
        sa.Column("exported_pdf_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("exported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["genealogist_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_archive_request_id"], ["archive_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["archive_request_templates.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_generated_archive_requests_source_archive_request_id"),
        "generated_archive_requests",
        ["source_archive_request_id"],
    )
    op.create_index(
        op.f("ix_generated_archive_requests_genealogist_id"),
        "generated_archive_requests",
        ["genealogist_id"],
    )
    op.create_index(
        op.f("ix_generated_archive_requests_template_id"),
        "generated_archive_requests",
        ["template_id"],
    )
    op.create_index(
        op.f("ix_generated_archive_requests_status"),
        "generated_archive_requests",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_generated_archive_requests_status"), table_name="generated_archive_requests")
    op.drop_index(op.f("ix_generated_archive_requests_template_id"), table_name="generated_archive_requests")
    op.drop_index(op.f("ix_generated_archive_requests_genealogist_id"), table_name="generated_archive_requests")
    op.drop_index(
        op.f("ix_generated_archive_requests_source_archive_request_id"),
        table_name="generated_archive_requests",
    )
    op.drop_table("generated_archive_requests")
