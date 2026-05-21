"""add ksai_enabled to usuarios

Revision ID: 468897a98586
Revises: 7093ac58ea99
Create Date: 2026-05-21 09:05:54.852729

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '468897a98586'
down_revision: Union[str, Sequence[str], None] = '7093ac58ea99'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('usuarios', sa.Column('ksai_enabled', sa.Boolean(), server_default='true', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('usuarios', 'ksai_enabled')
