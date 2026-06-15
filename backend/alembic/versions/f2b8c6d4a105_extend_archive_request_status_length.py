"""extend archive request status length

Revision ID: f2b8c6d4a105
Revises: e7a9c1f2b004
Create Date: 2026-06-13 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "f2b8c6d4a105"
down_revision = "e7a9c1f2b004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "archive_requests",
        "current_status",
        existing_type=sa.String(length=17),
        type_=sa.String(length=32),
        existing_nullable=False,
    )
    op.alter_column(
        "archive_request_status_history",
        "from_status",
        existing_type=sa.String(length=17),
        type_=sa.String(length=32),
        existing_nullable=True,
    )
    op.alter_column(
        "archive_request_status_history",
        "to_status",
        existing_type=sa.String(length=17),
        type_=sa.String(length=32),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "archive_request_status_history",
        "to_status",
        existing_type=sa.String(length=32),
        type_=sa.String(length=17),
        existing_nullable=False,
    )
    op.alter_column(
        "archive_request_status_history",
        "from_status",
        existing_type=sa.String(length=32),
        type_=sa.String(length=17),
        existing_nullable=True,
    )
    op.alter_column(
        "archive_requests",
        "current_status",
        existing_type=sa.String(length=32),
        type_=sa.String(length=17),
        existing_nullable=False,
    )
