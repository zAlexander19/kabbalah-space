"""email log table for tracking sent emails

Revision ID: 5af93b94c19a
Revises: 83754146bc35
Create Date: 2026-05-24 18:45:05.084445

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "5af93b94c19a"
down_revision: Union[str, Sequence[str], None] = "83754146bc35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("usuario_id", sa.String(length=36), sa.ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email_type", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("provider_message_id", sa.String(length=128), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.UniqueConstraint("idempotency_key", name="uq_email_log_idempotency_key"),
    )
    op.create_index("ix_email_log_usuario_type", "email_log", ["usuario_id", "email_type"])
    op.create_index("ix_email_log_status", "email_log", ["status"])


def downgrade() -> None:
    op.drop_index("ix_email_log_status", table_name="email_log")
    op.drop_index("ix_email_log_usuario_type", table_name="email_log")
    op.drop_table("email_log")
