"""Tests for the evolucion_nudge monthly nudge.

Covers the template render and the cron job conditions:
  - Fires at >=30 days since signup (cycle 1).
  - Skips if signup <30 days ago (cycle 0).
  - Cycle scoped idempotency — same cycle ticked twice = 1 send.
  - Next cycle (60 days) = fresh send despite earlier one.
  - Both free and premium users receive it.
"""
import pytest
import respx
from datetime import datetime, timedelta, timezone
from httpx import Response
from sqlalchemy import select

from models import Usuario
from billing.models import Subscription
from emails.models import EmailLog
from emails.templates.evolucion_nudge import render_evolucion_nudge
from scheduler.jobs import _evolucion_nudge_for_now


# ---------------- Template ----------------

def test_template_includes_name_cta_evolucion_link_and_no_voseo():
    html = render_evolucion_nudge(
        nombre="Alex",
        app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Alex" in html
    assert "evolución" in html
    assert "Ver mi evolución" in html  # CTA label
    assert "kabbalahspace.app/evolucion" in html  # CTA href
    # No voseo
    assert "podés" not in html and "querés" not in html and "preferís" not in html
    assert "vos" not in html and "sos" not in html


# ---------------- Job conditions ----------------

@pytest.fixture
def emails_on(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test")
    monkeypatch.setattr(s, "from_email", "x@x.com")
    monkeypatch.setattr(s, "emails_enabled", True)
    return s


async def _seed_user(db, *, uid: str, email: str, signup_days_ago: int) -> Usuario:
    signup = datetime.now(timezone.utc) - timedelta(days=signup_days_ago)
    u = Usuario(
        id=uid, email=email, nombre="Test", provider="email",
        fecha_creacion=signup,
    )
    db.add(u)
    await db.commit()
    return u


async def _seed_premium(db, *, uid: str):
    sub = Subscription(
        usuario_id=uid, status="active", plan="monthly",
        lemonsqueezy_subscription_id=f"ls-{uid}",
        lemonsqueezy_customer_id=f"lc-{uid}",
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(sub)
    await db.commit()


@pytest.mark.asyncio
async def test_fires_at_cycle_1_for_free_user(emails_on, db_session):
    now = datetime.now(timezone.utc)
    user = await _seed_user(db_session, uid="u1", email="u1@x.com", signup_days_ago=32)

    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-1"}))
        await _evolucion_nudge_for_now(db_session, now)

    assert len(route.calls) == 1
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.email_type == "evolucion_nudge", EmailLog.usuario_id == user.id)
    )).scalars().first()
    assert log is not None and log.status == "sent"
    assert log.idempotency_key == f"{user.id}-evolucion-cycle-1"


@pytest.mark.asyncio
async def test_fires_for_premium_user_too(emails_on, db_session):
    now = datetime.now(timezone.utc)
    user = await _seed_user(db_session, uid="u-prem", email="prem@x.com", signup_days_ago=35)
    await _seed_premium(db_session, uid=user.id)

    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-p"}))
        await _evolucion_nudge_for_now(db_session, now)

    assert len(route.calls) == 1


@pytest.mark.asyncio
async def test_skips_if_signup_under_30_days(emails_on, db_session):
    now = datetime.now(timezone.utc)
    await _seed_user(db_session, uid="u2", email="u2@x.com", signup_days_ago=10)

    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        await _evolucion_nudge_for_now(db_session, now)

    assert len(route.calls) == 0


@pytest.mark.asyncio
async def test_idempotent_same_cycle_twice(emails_on, db_session):
    """Two ticks in the same 30-day cycle for the same user = 1 send."""
    now = datetime.now(timezone.utc)
    await _seed_user(db_session, uid="u3", email="u3@x.com", signup_days_ago=40)

    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-3"}))
        await _evolucion_nudge_for_now(db_session, now)
        await _evolucion_nudge_for_now(db_session, now + timedelta(hours=2))

    assert len(route.calls) == 1


@pytest.mark.asyncio
async def test_new_cycle_fires_again(emails_on, db_session):
    """Cycle 1 already sent → 30 days later, cycle 2 fires fresh."""
    now = datetime.now(timezone.utc)
    user = await _seed_user(db_session, uid="u4", email="u4@x.com", signup_days_ago=40)

    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-4"}))
        # Cycle 1
        await _evolucion_nudge_for_now(db_session, now)
        assert len(route.calls) == 1
        # Simulate 30 days later — same user is now at cycle 2
        await _evolucion_nudge_for_now(db_session, now + timedelta(days=30))

    assert len(route.calls) == 2
    logs = (await db_session.execute(
        select(EmailLog).where(EmailLog.usuario_id == user.id, EmailLog.email_type == "evolucion_nudge")
    )).scalars().all()
    assert len(logs) == 2
    keys = sorted(l.idempotency_key for l in logs)
    assert keys == [f"{user.id}-evolucion-cycle-1", f"{user.id}-evolucion-cycle-2"]
