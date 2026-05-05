"""add password_hash to usuario

Revision ID: 1cfc102a2409
Revises: 328674a34f67
Create Date: 2026-05-05 18:18:45.986635

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1cfc102a2409'
down_revision: Union[str, Sequence[str], None] = '328674a34f67'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add password_hash column to usuarios.

    NOT NULL is safe here: there are no production users yet (auth is just
    landing in #7). Anyone with a pre-#7 dev DB containing user rows must
    wipe and re-migrate first.
    """
    op.add_column('usuarios', sa.Column('password_hash', sa.String(length=255), nullable=False))


def downgrade() -> None:
    op.drop_column('usuarios', 'password_hash')
