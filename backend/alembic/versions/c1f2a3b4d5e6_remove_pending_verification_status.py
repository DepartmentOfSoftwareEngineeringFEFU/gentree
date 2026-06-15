"""Remove pending verification user status from runtime data.

Revision ID: c1f2a3b4d5e6
Revises: a8f4d2c9b731
Create Date: 2026-06-15 00:00:00.000000
"""

from alembic import op


revision = "c1f2a3b4d5e6"
down_revision = "a8f4d2c9b731"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE users
        SET status = 'ACTIVE'
        WHERE status = 'PENDING_VERIFICATION'
        """
    )


def downgrade() -> None:
    pass
