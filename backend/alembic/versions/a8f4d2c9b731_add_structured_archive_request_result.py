"""Add structured archive request result fields.

Revision ID: a8f4d2c9b731
Revises: 9a1d5e7c3b20
Create Date: 2026-06-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a8f4d2c9b731"
down_revision = "9a1d5e7c3b20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("archive_requests", sa.Column("result_summary", sa.Text(), nullable=True))
    op.add_column("archive_requests", sa.Column("result_sources", sa.Text(), nullable=True))
    op.add_column("archive_requests", sa.Column("result_recommendations", sa.Text(), nullable=True))
    op.add_column("archive_requests", sa.Column("result_status", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("archive_requests", "result_status")
    op.drop_column("archive_requests", "result_recommendations")
    op.drop_column("archive_requests", "result_sources")
    op.drop_column("archive_requests", "result_summary")
