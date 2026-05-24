"""Tests for the email sender orquestrator: idempotency + preferencias + send."""
import pytest
import pytest_asyncio
import respx
from datetime import datetime, timezone
from httpx import Response
from sqlalchemy import select, func

from models import Usuario
from billing.models import EmailPreferences
from emails.models import EmailLog
from emails.sender import send_weekly_summary


@pytest.fixture
def emails_enabled(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test-key")
    monkeypatch.setattr(s, "from_email", "Kabbalah <test@x.com>")
    monkeypatch.setattr(s, "emails_enabled", True)
    return s


@pytest_asyncio.fixture
async def premium_user_with_prefs(db_session):
    user = Usuario(id="u-mail-1", email="recipient@x.com", nombre="Alex", provider="email")
    prefs = EmailPreferences(usuario_id="u-mail-1")  # defaults: all true
    db_session.add_all([user, prefs])
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_sender_sends_weekly_and_logs(emails_enabled, premium_user_with_prefs, db_session):
    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-1"}))

        result = await send_weekly_summary(
            db_session,
            user=premium_user_with_prefs,
            week_start=datetime(2026, 5, 17, tzinfo=timezone.utc),
            week_end=datetime(2026, 5, 24, tzinfo=timezone.utc),
            app_url="https://kab.app",
        )

    assert result == "msg-1"
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.usuario_id == "u-mail-1")
    )).scalars().first()
    assert log is not None
    assert log.email_type == "weekly"
    assert log.status == "sent"
    assert log.provider_message_id == "msg-1"


@pytest.mark.asyncio
async def test_sender_idempotent_on_same_period(emails_enabled, premium_user_with_prefs, db_session):
    """Calling twice with the same (user, week) → 1 email sent, 1 log row."""
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-1"}))

        await send_weekly_summary(
            db_session,
            user=premium_user_with_prefs,
            week_start=datetime(2026, 5, 17, tzinfo=timezone.utc),
            week_end=datetime(2026, 5, 24, tzinfo=timezone.utc),
            app_url="https://kab.app",
        )
        result_2 = await send_weekly_summary(
            db_session,
            user=premium_user_with_prefs,
            week_start=datetime(2026, 5, 17, tzinfo=timezone.utc),
            week_end=datetime(2026, 5, 24, tzinfo=timezone.utc),
            app_url="https://kab.app",
        )

    assert result_2 is None  # second call skipped
    assert len(route.calls) == 1

    count = (await db_session.execute(
        select(func.count(EmailLog.id)).where(EmailLog.usuario_id == "u-mail-1")
    )).scalar()
    assert count == 1


@pytest.mark.asyncio
async def test_sender_respects_opt_out_preference(emails_enabled, premium_user_with_prefs, db_session):
    """If weekly_summary preference is False, no email sent, no log row."""
    prefs = (await db_session.execute(
        select(EmailPreferences).where(EmailPreferences.usuario_id == "u-mail-1")
    )).scalars().first()
    prefs.weekly_summary = False
    await db_session.commit()

    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        result = await send_weekly_summary(
            db_session,
            user=premium_user_with_prefs,
            week_start=datetime(2026, 5, 17, tzinfo=timezone.utc),
            week_end=datetime(2026, 5, 24, tzinfo=timezone.utc),
            app_url="https://kab.app",
        )

    assert result is None
    assert len(route.calls) == 0

    count = (await db_session.execute(
        select(func.count(EmailLog.id)).where(EmailLog.usuario_id == "u-mail-1")
    )).scalar()
    assert count == 0


@pytest.mark.asyncio
async def test_sender_marks_failed_on_resend_error(emails_enabled, premium_user_with_prefs, db_session):
    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(500, text="boom"))

        with pytest.raises(Exception):
            await send_weekly_summary(
                db_session,
                user=premium_user_with_prefs,
                week_start=datetime(2026, 5, 17, tzinfo=timezone.utc),
                week_end=datetime(2026, 5, 24, tzinfo=timezone.utc),
                app_url="https://kab.app",
            )

    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.usuario_id == "u-mail-1")
    )).scalars().first()
    assert log is not None
    assert log.status == "failed"
    assert "boom" in (log.error_message or "")
