"""default timezone to America/Santiago

Revision ID: 3bcdbaf76c7b
Revises: 5af93b94c19a
Create Date: 2026-05-24 23:05:42.005872

Changes the default timezone for new usuarios from Buenos Aires to Santiago,
and updates existing rows that still hold the old default. Users who explicitly
chose a different timezone (any non-default value) are left untouched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3bcdbaf76c7b'
down_revision: Union[str, Sequence[str], None] = '5af93b94c19a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


OLD_DEFAULT = "America/Argentina/Buenos_Aires"
NEW_DEFAULT = "America/Santiago"


def upgrade() -> None:
    """Switch server_default + retag existing rows that still hold the old default."""
    with op.batch_alter_table("usuarios") as batch:
        batch.alter_column(
            "timezone",
            existing_type=sa.String(length=64),
            existing_nullable=False,
            server_default=NEW_DEFAULT,
        )
    op.execute(
        sa.text(f"UPDATE usuarios SET timezone = '{NEW_DEFAULT}' WHERE timezone = '{OLD_DEFAULT}'")
    )


def downgrade() -> None:
    with op.batch_alter_table("usuarios") as batch:
        batch.alter_column(
            "timezone",
            existing_type=sa.String(length=64),
            existing_nullable=False,
            server_default=OLD_DEFAULT,
        )
    op.execute(
        sa.text(f"UPDATE usuarios SET timezone = '{OLD_DEFAULT}' WHERE timezone = '{NEW_DEFAULT}'")
    )
