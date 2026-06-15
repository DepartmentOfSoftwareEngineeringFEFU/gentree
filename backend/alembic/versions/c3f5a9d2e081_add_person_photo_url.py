"""add person photo_url

Revision ID: c3f5a9d2e081
Revises: b2e1f3a7c901
Create Date: 2026-06-14 00:00:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = 'c3f5a9d2e081'
down_revision: str | None = 'b2e1f3a7c901'
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        'persons',
        sa.Column('photo_url', sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('persons', 'photo_url')
