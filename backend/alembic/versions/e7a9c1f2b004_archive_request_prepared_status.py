"""archive request prepared status

Revision ID: e7a9c1f2b004
Revises: d4c7b2a9f013
Create Date: 2026-06-13 00:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "e7a9c1f2b004"
down_revision = "d4c7b2a9f013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE archive_requests "
        "SET current_status = 'PREPARED' "
        "WHERE current_status = 'DRAFT'"
    )
    op.execute(
        "UPDATE archive_request_status_history "
        "SET from_status = 'PREPARED' "
        "WHERE from_status = 'DRAFT'"
    )
    op.execute(
        "UPDATE archive_request_status_history "
        "SET to_status = 'PREPARED' "
        "WHERE to_status = 'DRAFT'"
    )


def downgrade() -> None:
    pass
