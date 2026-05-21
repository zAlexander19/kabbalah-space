"""premium system: subscriptions, promo codes, reflexiones libres, webhook events, email prefs

Revision ID: 7093ac58ea99
Revises: e7470743e40a
Create Date: 2026-05-21 09:02:29.955277

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "7093ac58ea99"
down_revision: Union[str, Sequence[str], None] = "e7470743e40a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "usuarios",
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=False,
            server_default="America/Argentina/Buenos_Aires",
        ),
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("usuario_id", sa.String(length=36), sa.ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("plan", sa.String(length=20), nullable=False),
        sa.Column("lemonsqueezy_subscription_id", sa.String(length=64), nullable=False),
        sa.Column("lemonsqueezy_customer_id", sa.String(length=64), nullable=False),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"])
    op.create_index("ix_subscriptions_lemonsqueezy_subscription_id", "subscriptions", ["lemonsqueezy_subscription_id"], unique=True)

    op.create_table(
        "promo_codes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("trial_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("uses_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_promo_codes_code", "promo_codes", ["code"], unique=True)

    op.create_table(
        "email_preferences",
        sa.Column("usuario_id", sa.String(length=36), sa.ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("weekly_summary", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("monthly_summary", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("imbalance_alerts", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("reflection_reminders", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "webhook_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("event_id", sa.String(length=128), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("provider", "event_id", name="uq_webhook_provider_event"),
    )

    op.create_table(
        "reflexiones_libres",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("usuario_id", sa.String(length=36), sa.ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("sefira_id", sa.String(length=50), sa.ForeignKey("sefirot.id"), nullable=True),
        sa.Column("contenido", sa.Text(), nullable=False),
        sa.Column("fecha_creacion", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_reflexiones_libres_usuario_fecha", "reflexiones_libres", ["usuario_id", "fecha_creacion"])


def downgrade() -> None:
    op.drop_index("ix_reflexiones_libres_usuario_fecha", table_name="reflexiones_libres")
    op.drop_table("reflexiones_libres")
    op.drop_table("webhook_events")
    op.drop_table("email_preferences")
    op.drop_index("ix_promo_codes_code", table_name="promo_codes")
    op.drop_table("promo_codes")
    op.drop_index("ix_subscriptions_lemonsqueezy_subscription_id", table_name="subscriptions")
    op.drop_index("ix_subscriptions_status", table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_column("usuarios", "timezone")
