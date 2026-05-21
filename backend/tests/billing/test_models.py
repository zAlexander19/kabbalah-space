"""Tests for billing SQLAlchemy models."""
import pytest
from datetime import datetime, timedelta, timezone

from billing.models import Subscription, PromoCode, EmailPreferences, WebhookEvent, ReflexionLibre


def test_subscription_model_has_required_fields():
    """Subscription needs all fields from the spec."""
    sub = Subscription(
        id="sub-1",
        usuario_id="user-1",
        status="active",
        plan="monthly",
        lemonsqueezy_subscription_id="ls-sub-1",
        lemonsqueezy_customer_id="ls-cust-1",
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    assert sub.status == "active"
    assert sub.plan == "monthly"
    assert sub.trial_ends_at is None
    assert sub.canceled_at is None


def test_promo_code_defaults():
    code = PromoCode(id="p-1", code="LAUNCH7")
    from sqlalchemy import inspect
    cols = {c.name: c for c in inspect(PromoCode).columns}
    assert cols["trial_days"].server_default.arg == "7"
    assert cols["uses_count"].server_default.arg == "0"


def test_reflexion_libre_tipo_field():
    r = ReflexionLibre(
        id="r-1",
        usuario_id="user-1",
        tipo="sefira",
        sefira_id="jesed",
        contenido="texto",
    )
    assert r.tipo == "sefira"
    assert r.sefira_id == "jesed"


def test_webhook_event_tablename():
    """WebhookEvent should map to webhook_events table."""
    assert WebhookEvent.__tablename__ == "webhook_events"


def test_email_preferences_defaults():
    """All 4 email type toggles should default to true."""
    from sqlalchemy import inspect
    cols = {c.name: c for c in inspect(EmailPreferences).columns}
    for col in ("weekly_summary", "monthly_summary", "imbalance_alerts", "reflection_reminders"):
        assert cols[col].server_default.arg == "true"
