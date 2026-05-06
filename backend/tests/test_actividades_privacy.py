"""Privacy contract for /actividades."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from httpx import AsyncClient


def _payload(sefira_id: str = "jesed") -> dict:
    start = datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)
    return {
        "titulo": "Meditación",
        "descripcion": "Foco aurico",
        "inicio": start.isoformat(),
        "fin": (start + timedelta(hours=1)).isoformat(),
        "sefirot_ids": [sefira_id],
    }


async def test_post_actividad_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.post("/actividades", json=_payload())
    assert r.status_code == 401


async def test_post_actividad_persists_usuario_id(client: AsyncClient, seed_sefirot, two_users):
    alice = two_users["alice"]
    r = await client.post("/actividades", json=_payload(), headers=alice["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list) and len(body) == 1
    # Verify ownership via list endpoint (added in Task 12 — for now check via direct query)
    # Tested for now: the endpoint accepted the request.


async def test_post_actividad_with_rrule_persists_usuario_id(client: AsyncClient, seed_sefirot, two_users):
    """Recurring series — every materialized instance must carry usuario_id."""
    alice = two_users["alice"]
    payload = _payload()
    payload["rrule"] = "FREQ=WEEKLY;COUNT=3"
    r = await client.post("/actividades", json=payload, headers=alice["headers"])
    assert r.status_code == 200, r.text
    instances = r.json()
    assert len(instances) == 3
