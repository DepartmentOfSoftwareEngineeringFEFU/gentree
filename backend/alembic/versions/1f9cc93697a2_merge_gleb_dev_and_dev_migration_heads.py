"""merge gleb-dev and dev migration heads

Revision ID: 1f9cc93697a2
Revises: e5a2c8d1f047, f4c8d9e0a123
Create Date: 2026-06-15 22:23:38.231586

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1f9cc93697a2'
down_revision: str | None = ('e5a2c8d1f047', 'f4c8d9e0a123')
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
