"""multi-provider auth: provider/provider_id, nullable password_hash

Revision ID: 671344a9f31e
Revises: 1cfc102a2409
Create Date: 2026-05-05 18:53:49.166130

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '671344a9f31e'
down_revision: Union[str, Sequence[str], None] = '1cfc102a2409'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add provider/provider_id columns and make password_hash nullable.

    `server_default='email'` backfills any existing rows so the NOT NULL
    constraint is satisfied. We use batch_alter_table to make the
    `password_hash` nullable change work on SQLite (which does not support
    most ALTER COLUMN natively).
    """
    op.add_column(
        'usuarios',
        sa.Column('provider', sa.String(length=50), server_default='email', nullable=False),
    )
    op.add_column(
        'usuarios',
        sa.Column('provider_id', sa.String(length=255), nullable=True),
    )
    op.create_index(
        'ix_usuarios_provider_provider_id',
        'usuarios',
        ['provider', 'provider_id'],
        unique=False,
    )

    with op.batch_alter_table('usuarios') as batch_op:
        batch_op.alter_column(
            'password_hash',
            existing_type=sa.String(length=255),
            nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table('usuarios') as batch_op:
        batch_op.alter_column(
            'password_hash',
            existing_type=sa.String(length=255),
            nullable=False,
        )

    op.drop_index('ix_usuarios_provider_provider_id', table_name='usuarios')
    op.drop_column('usuarios', 'provider_id')
    op.drop_column('usuarios', 'provider')
