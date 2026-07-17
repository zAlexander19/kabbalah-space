"""Tests de los correos de activación (embudo A→B→C)."""
import pytest
import respx
from datetime import datetime, timedelta, timezone
from httpx import Response
from sqlalchemy import select

from models import Usuario, Sefira, PreguntaSefira, RespuestaPregunta, RegistroDiario, Actividad, ActividadSefira
from emails.models import EmailLog
from emails.templates.activation_no_start import render_activation_no_start
from emails.templates.activation_tree_incomplete import render_activation_tree_incomplete
from emails.templates.activation_no_activity import render_activation_no_activity


def _assert_no_voseo(html: str):
    assert "podés" not in html and "querés" not in html and "preferís" not in html


def test_no_start_template_render():
    html = render_activation_no_start(
        nombre="Alex", app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Alex" in html
    assert "kabbalahspace.app/cuenta" in html
    assert "Comenzar" in html  # CTA label
    _assert_no_voseo(html)


def test_tree_incomplete_template_render():
    html = render_activation_tree_incomplete(
        nombre="Alex", faltan=6, app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Alex" in html
    assert "6" in html  # cuántas faltan
    _assert_no_voseo(html)


def test_no_activity_template_render():
    html = render_activation_no_activity(
        nombre="Alex", app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Alex" in html
    assert "/calendario" in html  # CTA hacia el calendario
    _assert_no_voseo(html)


@pytest.fixture
def emails_on(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test")
    monkeypatch.setattr(s, "from_email", "x@x.com")
    monkeypatch.setattr(s, "emails_enabled", True)
    return s


async def _seed_user(db, *, uid, email, signup):
    u = Usuario(id=uid, email=email, nombre="Test", provider="google", fecha_creacion=signup)
    db.add(u)
    await db.commit()
    return u


@pytest.mark.asyncio
async def test_sender_respects_pref_off(emails_on, db_session):
    from billing.preferences import get_or_create_email_preferences
    from emails.sender import send_activation_nudge
    now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    u = await _seed_user(db_session, uid="a1", email="a1@x.com", signup=now - timedelta(days=5))
    prefs = await get_or_create_email_preferences(db_session, u.id)
    prefs.activation_nudges = False
    await db_session.commit()

    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        res = await send_activation_nudge(db_session, user=u, stage="no_start", app_url="https://k.app", now=now)
    assert res is None and len(route.calls) == 0


async def _pin_last_sent_at(db, *, usuario_id, email_type, sent_at):
    """`EmailLog.sent_at` usa `server_default=func.now()` — el reloj REAL de la
    máquina, no el `now` simulado que le pasamos a send_activation_nudge. Sin
    esto, el gateo por espaciado compara el `now` de prueba (fechas de 2026-06)
    contra un sent_at de reloj real muy posterior, y el resultado del test
    dependería de la fecha real de ejecución en vez de la lógica de espaciado.
    Pisamos el sent_at de la última fila insertada para que el test sea
    determinístico y ejercite el gateo real."""
    log = (await db.execute(
        select(EmailLog)
        .where(EmailLog.usuario_id == usuario_id, EmailLog.email_type == email_type)
        .order_by(EmailLog.id.desc())
    )).scalars().first()
    log.sent_at = sent_at
    await db.commit()


@pytest.mark.asyncio
async def test_sender_caps_at_three_sends(emails_on, db_session):
    from emails.sender import send_activation_nudge, ACTIVATION_RETRY_GAP_DAYS
    from billing.preferences import get_or_create_email_preferences
    now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    u = await _seed_user(db_session, uid="a2", email="a2@x.com", signup=now - timedelta(days=30))
    await get_or_create_email_preferences(db_session, u.id)

    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(200, json={"id": "m"}))
        t = now
        sent = 0
        for _ in range(5):
            r = await send_activation_nudge(db_session, user=u, stage="no_start", app_url="https://k.app", now=t)
            if r is not None:
                sent += 1
                await _pin_last_sent_at(db_session, usuario_id=u.id, email_type="activation_no_start", sent_at=t)
            t = t + timedelta(days=ACTIVATION_RETRY_GAP_DAYS)
    assert sent == 3  # tope de 3


@pytest.mark.asyncio
async def test_sender_spacing_skips_within_gap(emails_on, db_session):
    from emails.sender import send_activation_nudge
    from billing.preferences import get_or_create_email_preferences
    now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    u = await _seed_user(db_session, uid="a3", email="a3@x.com", signup=now - timedelta(days=10))
    await get_or_create_email_preferences(db_session, u.id)

    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(200, json={"id": "m"}))
        r1 = await send_activation_nudge(db_session, user=u, stage="no_start", app_url="https://k.app", now=now)
        await _pin_last_sent_at(db_session, usuario_id=u.id, email_type="activation_no_start", sent_at=now)
        r2 = await send_activation_nudge(db_session, user=u, stage="no_start", app_url="https://k.app", now=now + timedelta(days=1))
    assert r1 is not None and r2 is None  # el segundo cae dentro del gap de 3 días
