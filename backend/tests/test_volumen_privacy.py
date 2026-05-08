"""Privacy contract for /energia/volumen-semanal."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from httpx import AsyncClient


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
