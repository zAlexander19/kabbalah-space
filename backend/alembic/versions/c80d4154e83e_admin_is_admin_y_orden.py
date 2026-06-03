"""admin: is_admin y orden

Revision ID: c80d4154e83e
Revises: 3bcdbaf76c7b
Create Date: 2026-06-03 14:14:10.845621

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c80d4154e83e'
down_revision: Union[str, Sequence[str], None] = '3bcdbaf76c7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('usuarios', sa.Column('is_admin', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('preguntas_sefirot', sa.Column('orden', sa.Integer(), server_default='0', nullable=False))
    # Backfill: numerar las preguntas existentes por sefira segun fecha_creacion.
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, sefira_id FROM preguntas_sefirot ORDER BY sefira_id, fecha_creacion"
    )).fetchall()
    contador: dict[str, int] = {}
    for row in rows:
        idx = contador.get(row.sefira_id, 0)
        conn.execute(
            sa.text("UPDATE preguntas_sefirot SET orden = :o WHERE id = :i"),
            {"o": idx, "i": row.id},
        )
        contador[row.sefira_id] = idx + 1


def downgrade() -> None:
    op.drop_column('preguntas_sefirot', 'orden')
    op.drop_column('usuarios', 'is_admin')
