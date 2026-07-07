"""add generated attachment titles

Revision ID: c7a4f3b8d902
Revises: 6b2d8e4f9012
Create Date: 2026-07-06 05:10:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "c7a4f3b8d902"
down_revision: str | None = "6b2d8e4f9012"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "generated_archive_requests",
        sa.Column(
            "attached_document_titles",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )


def downgrade() -> None:
    op.drop_column("generated_archive_requests", "attached_document_titles")
