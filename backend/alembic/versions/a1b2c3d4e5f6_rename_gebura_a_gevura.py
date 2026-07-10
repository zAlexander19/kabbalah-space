"""Renombra la sefira 'Guebura' a 'Gevura' (con acento) en la tabla sefirot.

El id ya era 'gevura'; solo cambia el nombre para mostrar. (Los .py se leen
como UTF-8 por spec de Python, asi que el acento literal es seguro incluso en
el contenedor de DO con locale ASCII; el problema historico era alembic.ini.)

Revision ID: a1b2c3d4e5f6
Revises: c80d4154e83e
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'c80d4154e83e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NUEVO = 'Gevurá'      # "Gevura" con acento en la a final
VIEJO = 'Gueburá'


def upgrade() -> None:
    op.execute(f"UPDATE sefirot SET nombre = '{NUEVO}' WHERE id = 'gevura'")


def downgrade() -> None:
    op.execute(f"UPDATE sefirot SET nombre = '{VIEJO}' WHERE id = 'gevura'")
