"""add activation_nudges pref

Revision ID: b4e38fa0ea77
Revises: a1b2c3d4e5f6
Create Date: 2026-07-16 22:03:00.224296

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4e38fa0ea77'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "email_preferences",
        sa.Column("activation_nudges", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("email_preferences", "activation_nudges")
