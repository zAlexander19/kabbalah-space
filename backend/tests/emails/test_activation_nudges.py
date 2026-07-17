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


@pytest.mark.asyncio
async def test_failed_send_does_not_consume_attempt(emails_on, db_session):
    """Un fallo transitorio de Resend no debe consumir el tope de 3 ni arrancar
    el reloj de espaciado: el reintento (con la MISMA `now`, dentro de lo que
    sería el gap de 3 días si el fallo hubiera contado) debe enviar igual."""
    from emails.sender import send_activation_nudge
    from emails.client import ResendError
    from billing.preferences import get_or_create_email_preferences
    now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    u = await _seed_user(db_session, uid="a4", email="a4@x.com", signup=now - timedelta(days=10))
    await get_or_create_email_preferences(db_session, u.id)

    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(500, text="boom"))
        with pytest.raises(ResendError):
            await send_activation_nudge(db_session, user=u, stage="no_start", app_url="https://k.app", now=now)

    failed_log = (await db_session.execute(
        select(EmailLog)
        .where(EmailLog.usuario_id == u.id, EmailLog.email_type == "activation_no_start")
        .order_by(EmailLog.id.desc())
    )).scalars().first()
    assert failed_log is not None
    assert failed_log.status == "failed"
    assert failed_log.idempotency_key == "a4-activation_no_start-1"

    # Reintento, todavía dentro de lo que habría sido el gap de 3 días si el
    # fallo hubiera contado — debe enviar igual, porque el fallo no consumió
    # el tope ni arrancó el reloj de espaciado.
    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(200, json={"id": "m"}))
        result = await send_activation_nudge(
            db_session, user=u, stage="no_start", app_url="https://k.app",
            now=now + timedelta(days=1),
        )
    assert result == "m"

    sent_log = (await db_session.execute(
        select(EmailLog)
        .where(EmailLog.usuario_id == u.id, EmailLog.email_type == "activation_no_start", EmailLog.status == "sent")
    )).scalars().first()
    assert sent_log is not None
    assert sent_log.idempotency_key == "a4-activation_no_start-2"
    assert sent_log.idempotency_key != failed_log.idempotency_key


# ---------------- SCHEDULER TICK: _activation_for_now (precedencia A→B→C) ----------------
# Nota de esquema: Sefira.pilar es nullable=False sin default/server_default
# (ver backend/models.py y el fixture seed_sefirot en conftest.py) — hay que
# setearlo explícitamente o el INSERT falla con NOT NULL constraint failed,
# incluso sin foreign_keys=ON. RespuestaPregunta.pregunta_id es FK a
# preguntas_sefirot.id pero este proyecto no activa PRAGMA foreign_keys, así
# que un pregunta_id "colgante" (sin fila PreguntaSefira real) inserta sin error.

_PILARES = {
    "keter": "centro", "jojma": "derecha", "bina": "izquierda",
    "jesed": "derecha", "gevura": "izquierda", "tiferet": "centro",
    "netzaj": "derecha", "hod": "izquierda", "yesod": "centro", "maljut": "centro",
}


async def _seed_sefirot(db):
    ids = ["keter", "jojma", "bina", "jesed", "gevura", "tiferet", "netzaj", "hod", "yesod", "maljut"]
    for sid in ids:
        db.add(Sefira(id=sid, nombre=sid.capitalize(), pilar=_PILARES[sid]))
    await db.commit()
    return ids


async def _classify(db, *, usuario_id, sefira_id, when):
    """Marca una sefirá como clasificada: RegistroDiario con puntuacion_ia."""
    db.add(RegistroDiario(
        usuario_id=usuario_id, sefira_id=sefira_id,
        puntuacion_ia=7, reflexion_texto=None, fecha_registro=when,
    ))
    # una respuesta también, para contar "empezó"
    db.add(RespuestaPregunta(
        usuario_id=usuario_id, pregunta_id=f"p-{sefira_id}",
        respuesta_texto="x", fecha_registro=when,
    ))
    await db.commit()


@pytest.mark.asyncio
async def test_stage_a_no_start_fires_after_2_days(emails_on, db_session):
    now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    await _seed_sefirot(db_session)
    await _seed_user(db_session, uid="s1", email="s1@x.com", signup=now - timedelta(days=2))
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "m"}))
        from scheduler.jobs import _activation_for_now
        await _activation_for_now(db_session, now)
    log = (await db_session.execute(select(EmailLog).where(EmailLog.usuario_id == "s1"))).scalars().first()
    assert log is not None and log.email_type == "activation_no_start" and len(route.calls) == 1


@pytest.mark.asyncio
async def test_stage_a_skips_before_2_days(emails_on, db_session):
    now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    await _seed_sefirot(db_session)
    await _seed_user(db_session, uid="s2", email="s2@x.com", signup=now - timedelta(hours=12))
    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        from scheduler.jobs import _activation_for_now
        await _activation_for_now(db_session, now)
    assert len(route.calls) == 0


@pytest.mark.asyncio
async def test_stage_b_tree_incomplete_fires_when_idle(emails_on, db_session):
    now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    ids = await _seed_sefirot(db_session)
    await _seed_user(db_session, uid="s3", email="s3@x.com", signup=now - timedelta(days=10))
    # clasifica 4 de 10, última respuesta hace 3 días (idle)
    for sid in ids[:4]:
        await _classify(db_session, usuario_id="s3", sefira_id=sid, when=now - timedelta(days=3))
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "m"}))
        from scheduler.jobs import _activation_for_now
        await _activation_for_now(db_session, now)
    log = (await db_session.execute(select(EmailLog).where(EmailLog.usuario_id == "s3"))).scalars().first()
    assert log.email_type == "activation_tree_incomplete" and len(route.calls) == 1


@pytest.mark.asyncio
async def test_stage_b_skips_when_recently_active(emails_on, db_session):
    """Regresión: si la última respuesta es reciente (< ACTIVATION_FIRST_DELAY_DAYS),
    el usuario sigue "activo" y NO debe recibir el nudge de etapa B, aunque ya
    tenga respuestas (no es etapa A) y le falten sefirot por clasificar."""
    now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    ids = await _seed_sefirot(db_session)
    await _seed_user(db_session, uid="s5", email="s5@x.com", signup=now - timedelta(days=10))
    # clasifica 3 de 10, última respuesta hace apenas 1 día (activo, no idle)
    for sid in ids[:3]:
        await _classify(db_session, usuario_id="s5", sefira_id=sid, when=now - timedelta(days=1))
    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        from scheduler.jobs import _activation_for_now
        await _activation_for_now(db_session, now)
    log = (await db_session.execute(select(EmailLog).where(EmailLog.usuario_id == "s5"))).scalars().first()
    assert log is None and len(route.calls) == 0


@pytest.mark.asyncio
async def test_stage_c_no_activity_only_when_tree_complete(emails_on, db_session):
    now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    ids = await _seed_sefirot(db_session)
    await _seed_user(db_session, uid="s4", email="s4@x.com", signup=now - timedelta(days=20))
    for sid in ids:  # las 10, última hace 3 días
        await _classify(db_session, usuario_id="s4", sefira_id=sid, when=now - timedelta(days=3))
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "m"}))
        from scheduler.jobs import _activation_for_now
        await _activation_for_now(db_session, now)
    log = (await db_session.execute(select(EmailLog).where(EmailLog.usuario_id == "s4"))).scalars().first()
    assert log.email_type == "activation_no_activity" and len(route.calls) == 1
