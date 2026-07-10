"""Privacy contract for /energia/volumen-semanal."""
from __future__ import annotations

from datetime import date, datetime, time, timezone, timedelta

import pytest
from httpx import AsyncClient


def test_volumen_overlap_maneja_datetimes_aware():
    """Regresión (bug prod 2026-07-10): la columna Actividad.inicio/fin es
    DateTime(timezone=True) → Postgres la devuelve CON tz, SQLite SIN tz. El
    endpoint compara contra week_start/end naive; sin normalizar, max()/min()
    tiran 'can't compare offset-naive and offset-aware datetimes' → 500.
    Este test corre igual en SQLite y Postgres porque construye las fechas a mano.
    """
    from main import normalize_datetime

    week_start = datetime.combine(date(2026, 7, 6), time.min)   # naive, como el endpoint
    week_end = datetime.combine(date(2026, 7, 13), time.min)
    inicio_aware = datetime(2026, 7, 10, 14, tzinfo=timezone.utc)  # como Postgres
    fin_aware = datetime(2026, 7, 10, 16, tzinfo=timezone.utc)

    # El bug: comparar aware vs naive explota.
    with pytest.raises(TypeError):
        max(inicio_aware, week_start)

    # El fix: normalizar a naive-UTC primero → comparable y con overlap correcto.
    overlap_start = max(normalize_datetime(inicio_aware), week_start)
    overlap_end = min(normalize_datetime(fin_aware), week_end)
    horas = (overlap_end - overlap_start).total_seconds() / 3600.0
    assert horas == 2.0


async def test_volumen_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/energia/volumen-semanal")
    assert r.status_code == 401


async def test_volumen_isolates_per_user(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    start = datetime.now(timezone.utc).replace(hour=10, minute=0, second=0, microsecond=0)
    payload = {
        "titulo": "Med",
        "descripcion": "",
        "inicio": start.isoformat(),
        "fin": (start + timedelta(hours=2)).isoformat(),
        "sefirot_ids": ["jesed"],
    }
    r = await client.post("/actividades", json=payload, headers=alice["headers"])
    assert r.status_code == 200

    r_alice = await client.get("/energia/volumen-semanal", headers=alice["headers"])
    alice_jesed = next(v for v in r_alice.json()["volumen"] if v["sefira_id"] == "jesed")
    assert alice_jesed["actividades_total"] == 1

    r_bob = await client.get("/energia/volumen-semanal", headers=bob["headers"])
    bob_jesed = next(v for v in r_bob.json()["volumen"] if v["sefira_id"] == "jesed")
    assert bob_jesed["actividades_total"] == 0
