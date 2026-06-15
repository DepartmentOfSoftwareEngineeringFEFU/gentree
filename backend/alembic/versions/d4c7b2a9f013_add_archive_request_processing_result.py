"""add archive request processing result fields

Revision ID: d4c7b2a9f013
Revises: b2e1f3a7c901
Create Date: 2026-06-13 20:10:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = 'd4c7b2a9f013'
down_revision: str | None = 'b2e1f3a7c901'
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column('archive_requests', sa.Column('processing_comment', sa.Text(), nullable=True))
    op.add_column('archive_requests', sa.Column('found_information', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('archive_requests', 'found_information')
    op.drop_column('archive_requests', 'processing_comment')
