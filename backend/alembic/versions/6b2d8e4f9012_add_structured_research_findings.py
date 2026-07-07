"""add structured research findings to archive requests

Revision ID: 6b2d8e4f9012
Revises: 1f9cc93697a2
Create Date: 2026-06-16 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "6b2d8e4f9012"
down_revision: str | None = "1f9cc93697a2"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "archive_requests",
        sa.Column("result_persons", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )
    op.add_column(
        "archive_requests",
        sa.Column("result_facts", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )
    op.add_column(
        "archive_requests",
        sa.Column("result_relationships", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )
    op.add_column(
        "archive_requests",
        sa.Column("result_document_links", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )


def downgrade() -> None:
    op.drop_column("archive_requests", "result_document_links")
    op.drop_column("archive_requests", "result_relationships")
    op.drop_column("archive_requests", "result_facts")
    op.drop_column("archive_requests", "result_persons")
