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


def test_subscription_updated_at_has_onupdate():
    """Subscription.updated_at must auto-update via onupdate=func.now()."""
    from sqlalchemy import inspect
    cols = {c.name: c for c in inspect(Subscription).columns}
    assert cols["updated_at"].onupdate is not None, "updated_at missing onupdate"


def test_email_preferences_updated_at_has_onupdate():
    """EmailPreferences.updated_at must auto-update via onupdate=func.now()."""
    from sqlalchemy import inspect
    cols = {c.name: c for c in inspect(EmailPreferences).columns}
    assert cols["updated_at"].onupdate is not None, "updated_at missing onupdate"


def test_webhook_event_has_unique_constraint():
    """WebhookEvent must have UniqueConstraint(provider, event_id) for idempotency."""
    from sqlalchemy import UniqueConstraint as UC
    uc = [c for c in WebhookEvent.__table__.constraints
          if isinstance(c, UC) and c.name == "uq_webhook_provider_event"]
    assert len(uc) == 1, "missing uq_webhook_provider_event UniqueConstraint"
    cols = sorted([c.name for c in uc[0].columns])
    assert cols == ["event_id", "provider"]
