"""enforce usuario_id on user data tables

Revision ID: 2c0d255f7492
Revises: 671344a9f31e
Create Date: 2026-05-06 09:21:14.893796

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2c0d255f7492'
down_revision: Union[str, Sequence[str], None] = '671344a9f31e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Enforce per-user ownership.

    Wipes any existing rows with NULL usuario_id (all of them, today — the
    columns existed but were never written) and sets NOT NULL + index.
    Safe in dev; no production data exists yet.
    """
    # 1) Wipe legacy user data so the upcoming NOT NULL constraint can be applied.
    #    actividades_sefirot has no usuario_id but is a child of actividades (FK
    #    CASCADE) — delete it first to be safe under any FK-enforcement mode.
    op.execute("DELETE FROM actividades_sefirot")
    op.execute("DELETE FROM actividades")
    op.execute("DELETE FROM respuestas_preguntas")
    op.execute("DELETE FROM registros_diario")

    # 2) NOT NULL + index per table (batch_alter for SQLite compat).
    with op.batch_alter_table("registros_diario") as batch_op:
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.create_index(op.f("ix_registros_diario_usuario_id"), ["usuario_id"])

    with op.batch_alter_table("respuestas_preguntas") as batch_op:
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.create_index(op.f("ix_respuestas_preguntas_usuario_id"), ["usuario_id"])

    with op.batch_alter_table("actividades") as batch_op:
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.create_index(op.f("ix_actividades_usuario_id"), ["usuario_id"])


def downgrade() -> None:
    with op.batch_alter_table("actividades") as batch_op:
        batch_op.drop_index(op.f("ix_actividades_usuario_id"))
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=True)

    with op.batch_alter_table("respuestas_preguntas") as batch_op:
        batch_op.drop_index(op.f("ix_respuestas_preguntas_usuario_id"))
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=True)

    with op.batch_alter_table("registros_diario") as batch_op:
        batch_op.drop_index(op.f("ix_registros_diario_usuario_id"))
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=True)
