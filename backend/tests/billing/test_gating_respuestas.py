"""Tests for cooldown parameterization: free=30d, premium=7d on guide question respuestas."""
import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import text


async def _backdate_respuesta(db_session, days_ago: int):
    """Backdate the most recent respuesta_pregunta by N days (single row in test DB)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    await db_session.execute(
        text("UPDATE respuestas_preguntas SET fecha_registro = :ts"), {"ts": cutoff}
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_free_user_blocked_8_days_after_answer(
    client, free_user_headers, seeded_pregunta, db_session
):
    """Free user: cooldown is 30 days. 8 days later, still blocked (409)."""
    payload = {"pregunta_id": seeded_pregunta.id, "respuesta_texto": "primera"}
    r = await client.post("/respuestas", json=payload, headers=free_user_headers)
    assert r.status_code in (200, 201), r.text

    await _backdate_respuesta(db_session, days_ago=8)

    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "segunda"},
        headers=free_user_headers,
    )
    assert r.status_code == 409, r.text


@pytest.mark.asyncio
async def test_premium_user_unblocked_8_days_after_answer(
    client, premium_user_headers, seeded_pregunta, db_session
):
    """Premium user: cooldown is 7 days. 8 days later, can answer again."""
    payload = {"pregunta_id": seeded_pregunta.id, "respuesta_texto": "primera"}
    r = await client.post("/respuestas", json=payload, headers=premium_user_headers)
    assert r.status_code in (200, 201), r.text

    await _backdate_respuesta(db_session, days_ago=8)

    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "segunda"},
        headers=premium_user_headers,
    )
    assert r.status_code in (200, 201), r.text


@pytest.mark.asyncio
async def test_premium_user_still_blocked_5_days_after_answer(
    client, premium_user_headers, seeded_pregunta, db_session
):
    """Premium user: 5 days < 7-day premium cooldown, still blocked."""
    payload = {"pregunta_id": seeded_pregunta.id, "respuesta_texto": "primera"}
    r = await client.post("/respuestas", json=payload, headers=premium_user_headers)
    assert r.status_code in (200, 201)

    await _backdate_respuesta(db_session, days_ago=5)

    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "segunda"},
        headers=premium_user_headers,
    )
    assert r.status_code == 409


# ---------- /forzar y /duplicar: respetan cooldown semanal ----------
# La cadencia mínima para premium es 7 días, alineada con la granularidad
# semanal del gráfico Mi Evolución. Los endpoints /forzar y /duplicar no
# pueden bypassarla.

@pytest.mark.asyncio
async def test_forzar_blocked_within_cooldown(
    client, premium_user_headers, seeded_pregunta, db_session
):
    """Premium /forzar: 5 días < 7d cooldown → 409."""
    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "primera"},
        headers=premium_user_headers,
    )
    assert r.status_code in (200, 201)

    await _backdate_respuesta(db_session, days_ago=5)

    r = await client.post(
        f"/respuestas/{seeded_pregunta.id}/forzar",
        json={"respuesta_texto": "intento de reinicio temprano"},
        headers=premium_user_headers,
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["reason"] == "respuesta_cooldown"


@pytest.mark.asyncio
async def test_forzar_allowed_after_cooldown(
    client, premium_user_headers, seeded_pregunta, db_session
):
    """Premium /forzar: 8 días > 7d cooldown → 200."""
    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "primera"},
        headers=premium_user_headers,
    )
    assert r.status_code in (200, 201)

    await _backdate_respuesta(db_session, days_ago=8)

    r = await client.post(
        f"/respuestas/{seeded_pregunta.id}/forzar",
        json={"respuesta_texto": "nuevo ciclo"},
        headers=premium_user_headers,
    )
    assert r.status_code in (200, 201), r.text


@pytest.mark.asyncio
async def test_duplicar_blocked_within_cooldown(
    client, premium_user_headers, seeded_pregunta, db_session
):
    """Premium /duplicar: 5 días < 7d cooldown → 409."""
    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "primera"},
        headers=premium_user_headers,
    )
    assert r.status_code in (200, 201)

    await _backdate_respuesta(db_session, days_ago=5)

    r = await client.post(
        f"/respuestas/{seeded_pregunta.id}/duplicar",
        headers=premium_user_headers,
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["reason"] == "respuesta_cooldown"


@pytest.mark.asyncio
async def test_duplicar_allowed_after_cooldown(
    client, premium_user_headers, seeded_pregunta, db_session
):
    """Premium /duplicar: 8 días > 7d cooldown → 200."""
    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "primera"},
        headers=premium_user_headers,
    )
    assert r.status_code in (200, 201)

    await _backdate_respuesta(db_session, days_ago=8)

    r = await client.post(
        f"/respuestas/{seeded_pregunta.id}/duplicar",
        headers=premium_user_headers,
    )
    assert r.status_code in (200, 201), r.text
