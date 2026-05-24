"""reflexion_texto nullable en registros_diario

Revision ID: 83754146bc35
Revises: 468897a98586
Create Date: 2026-05-24 13:46:57.191310

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '83754146bc35'
down_revision: Union[str, Sequence[str], None] = '468897a98586'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('registros_diario') as batch_op:
        batch_op.alter_column('reflexion_texto',
                   existing_type=sa.Text(),
                   nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('registros_diario') as batch_op:
        batch_op.alter_column('reflexion_texto',
                   existing_type=sa.Text(),
                   nullable=False)
