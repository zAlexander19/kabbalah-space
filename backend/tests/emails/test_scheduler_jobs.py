"""Tests for the inner per-tick functions — given a known 'now' and a seeded
DB, verify the right email is sent (via respx) for the right user."""
import pytest
import pytest_asyncio
import respx
from datetime import datetime, timedelta, timezone
from httpx import Response
from sqlalchemy import select

from models import Usuario
from billing.models import Subscription, EmailPreferences
from emails.models import EmailLog
from scheduler.jobs import _weekly_summary_for_now, _monthly_summary_for_now


@pytest.fixture
def emails_on(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test")
    monkeypatch.setattr(s, "from_email", "x@x.com")
    monkeypatch.setattr(s, "emails_enabled", True)
    return s


@pytest_asyncio.fixture
async def premium_ba(db_session):
    """Premium user with Buenos Aires timezone (UTC-3)."""
    user = Usuario(
        id="u-ba", email="ba@x.com", nombre="Alex", provider="email",
        timezone="America/Argentina/Buenos_Aires",
    )
    sub = Subscription(
        usuario_id="u-ba", status="active", plan="monthly",
        lemonsqueezy_subscription_id="ls-ba",
        lemonsqueezy_customer_id="lc-ba",
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    prefs = EmailPreferences(usuario_id="u-ba")
    db_session.add_all([user, sub, prefs])
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_weekly_fires_on_sunday_9am_local(emails_on, premium_ba, db_session):
    """Sunday 2026-05-24 12:00 UTC = Sunday 09:00 ART → weekly fires."""
    fake_now = datetime(2026, 5, 24, 12, 0, tzinfo=timezone.utc)
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-w"}))
        await _weekly_summary_for_now(db_session, fake_now)
    assert len(route.calls) == 1
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.usuario_id == "u-ba", EmailLog.email_type == "weekly")
    )).scalars().first()
    assert log is not None
    assert log.status == "sent"


@pytest.mark.asyncio
async def test_weekly_does_not_fire_at_other_times(emails_on, premium_ba, db_session):
    """Sunday 2026-05-24 18:00 UTC = Sunday 15:00 ART → no fire."""
    fake_now = datetime(2026, 5, 24, 18, 0, tzinfo=timezone.utc)
    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        await _weekly_summary_for_now(db_session, fake_now)
    assert len(route.calls) == 0


@pytest.mark.asyncio
async def test_weekly_does_not_fire_on_non_sunday(emails_on, premium_ba, db_session):
    """Monday 2026-05-25 12:00 UTC = Monday 09:00 ART → no fire even at 9am."""
    fake_now = datetime(2026, 5, 25, 12, 0, tzinfo=timezone.utc)
    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        await _weekly_summary_for_now(db_session, fake_now)
    assert len(route.calls) == 0


@pytest.mark.asyncio
async def test_monthly_fires_on_first_of_month_9am_local(emails_on, premium_ba, db_session):
    """2026-06-01 12:00 UTC = 2026-06-01 09:00 ART → monthly fires."""
    fake_now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-m"}))
        await _monthly_summary_for_now(db_session, fake_now)
    assert len(route.calls) == 1
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.usuario_id == "u-ba", EmailLog.email_type == "monthly")
    )).scalars().first()
    assert log is not None
    assert log.status == "sent"
