"""Tests for the gcal_link_suggestion transactional email.

Covers the template render and the cron job conditions:
  - Fires when user has >=5 activities, gcal NOT linked, last creation >=2h ago.
  - Skips when gcal already linked.
  - Skips when activity count <5.
  - Skips when last activity created <2h ago (still in creation streak).
  - Skips on second tick after success (idempotency via EmailLog UNIQUE).
"""
import pytest
import respx
from datetime import datetime, timedelta, timezone
from httpx import Response
from sqlalchemy import select

from models import Usuario, Actividad
from emails.models import EmailLog
from emails.templates.gcal_link_suggestion import render_gcal_link_suggestion
from scheduler.jobs import _gcal_link_suggestion_for_now


# ---------------- Template ----------------

def test_template_includes_name_cta_and_reminder_copy():
    html = render_gcal_link_suggestion(
        nombre="Alex",
        app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Alex" in html
    assert "No olvides" in html  # aviso-style hook
    assert "Google Calendar" in html
    assert "kabbalahspace.app/cuenta" in html  # CTA + footer both go to /cuenta
    assert "Sincronizar ahora" in html  # CTA label
    # Negative: ensure we didn't accidentally include voseo
    assert "podés" not in html and "querés" not in html and "preferís" not in html


# ---------------- Job conditions ----------------

@pytest.fixture
def emails_on(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test")
    monkeypatch.setattr(s, "from_email", "x@x.com")
    monkeypatch.setattr(s, "emails_enabled", True)
    return s


async def _seed_user(db, *, uid: str, email: str, gcal_enabled: bool = False) -> Usuario:
    u = Usuario(
        id=uid, email=email, nombre="Test", provider="email",
        gcal_sync_enabled=gcal_enabled,
    )
    db.add(u)
    await db.commit()
    return u


async def _seed_actividades(db, *, usuario_id: str, count: int, last_created_at: datetime):
    """Seed `count` activities. The last one created at `last_created_at`; the
    rest spaced 1 minute earlier each."""
    for i in range(count):
        created = last_created_at - timedelta(minutes=count - 1 - i)
        a = Actividad(
            usuario_id=usuario_id,
            titulo=f"act {i}",
            inicio=created,
            fin=created + timedelta(hours=1),
            fecha_creacion=created,
        )
        db.add(a)
    await db.commit()


@pytest.mark.asyncio
async def test_fires_when_5_activities_gcal_off_idle_2h(emails_on, db_session):
    now = datetime(2026, 5, 29, 18, 0, tzinfo=timezone.utc)
    user = await _seed_user(db_session, uid="u1", email="u1@x.com", gcal_enabled=False)
    await _seed_actividades(
        db_session, usuario_id=user.id, count=5,
        last_created_at=now - timedelta(hours=2, minutes=15),
    )

    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-gcal"}))
        await _gcal_link_suggestion_for_now(db_session, now)

    assert len(route.calls) == 1
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.email_type == "gcal_link_suggestion")
    )).scalars().first()
    assert log is not None and log.status == "sent" and log.usuario_id == user.id


@pytest.mark.asyncio
async def test_skips_when_gcal_already_linked(emails_on, db_session):
    now = datetime(2026, 5, 29, 18, 0, tzinfo=timezone.utc)
    user = await _seed_user(db_session, uid="u2", email="u2@x.com", gcal_enabled=True)
    await _seed_actividades(
        db_session, usuario_id=user.id, count=10,
        last_created_at=now - timedelta(hours=5),
    )

    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        await _gcal_link_suggestion_for_now(db_session, now)

    assert len(route.calls) == 0


@pytest.mark.asyncio
async def test_skips_when_under_5_activities(emails_on, db_session):
    now = datetime(2026, 5, 29, 18, 0, tzinfo=timezone.utc)
    user = await _seed_user(db_session, uid="u3", email="u3@x.com")
    await _seed_actividades(
        db_session, usuario_id=user.id, count=4,
        last_created_at=now - timedelta(hours=5),
    )

    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        await _gcal_link_suggestion_for_now(db_session, now)

    assert len(route.calls) == 0


@pytest.mark.asyncio
async def test_skips_when_last_activity_too_recent(emails_on, db_session):
    now = datetime(2026, 5, 29, 18, 0, tzinfo=timezone.utc)
    user = await _seed_user(db_session, uid="u4", email="u4@x.com")
    await _seed_actividades(
        db_session, usuario_id=user.id, count=8,
        last_created_at=now - timedelta(minutes=30),  # still in creation streak
    )

    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        await _gcal_link_suggestion_for_now(db_session, now)

    assert len(route.calls) == 0


@pytest.mark.asyncio
async def test_idempotent_second_tick_no_resend(emails_on, db_session):
    """If we already sent it once, a second tick must not re-send (UNIQUE
    on email_log idempotency_key blocks it)."""
    now = datetime(2026, 5, 29, 18, 0, tzinfo=timezone.utc)
    user = await _seed_user(db_session, uid="u5", email="u5@x.com")
    await _seed_actividades(
        db_session, usuario_id=user.id, count=6,
        last_created_at=now - timedelta(hours=3),
    )

    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-1"}))
        await _gcal_link_suggestion_for_now(db_session, now)
        # Second tick — same conditions, should NOT send again.
        await _gcal_link_suggestion_for_now(db_session, now + timedelta(hours=1))

    assert len(route.calls) == 1
