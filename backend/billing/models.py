"""SQLAlchemy models for the premium / billing module.

Source of truth for "is this user premium right now?" is the join between
usuarios and subscriptions (status in trial|active). Do NOT denormalize an
is_premium boolean on usuarios — webhooks can lag and the bool gets stale.
"""
import uuid
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from database import Base


def _uuid():
    return str(uuid.uuid4())


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(String(36), primary_key=True, default=_uuid)
    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, unique=True)
    status = Column(String(20), nullable=False)
    plan = Column(String(20), nullable=False)
    lemonsqueezy_subscription_id = Column(String(64), nullable=False, unique=True, index=True)
    lemonsqueezy_customer_id = Column(String(64), nullable=False)
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)
    current_period_start = Column(DateTime(timezone=True), nullable=False)
    current_period_end = Column(DateTime(timezone=True), nullable=False)
    canceled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id = Column(String(36), primary_key=True, default=_uuid)
    code = Column(String(64), nullable=False, unique=True, index=True)
    trial_days = Column(Integer, nullable=False, server_default="7")
    max_uses = Column(Integer, nullable=True)
    uses_count = Column(Integer, nullable=False, server_default="0")
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EmailPreferences(Base):
    __tablename__ = "email_preferences"

    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    weekly_summary = Column(Boolean, nullable=False, server_default="true")
    monthly_summary = Column(Boolean, nullable=False, server_default="true")
    imbalance_alerts = Column(Boolean, nullable=False, server_default="true")
    reflection_reminders = Column(Boolean, nullable=False, server_default="true")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(32), nullable=False)
    event_id = Column(String(128), nullable=False)
    event_type = Column(String(64), nullable=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("provider", "event_id", name="uq_webhook_provider_event"),)


class ReflexionLibre(Base):
    __tablename__ = "reflexiones_libres"

    id = Column(String(36), primary_key=True, default=_uuid)
    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo = Column(String(20), nullable=False)
    sefira_id = Column(String(50), ForeignKey("sefirot.id"), nullable=True)
    contenido = Column(Text, nullable=False)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
