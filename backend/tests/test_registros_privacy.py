"""Privacy contract for /evaluate and /registros."""
from __future__ import annotations

from httpx import AsyncClient


async def test_evaluate_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.post("/evaluate", json={
        "sefira": "Jésed", "sefira_id": "jesed",
        "text": "anon attempt", "score": 7.0,
    })
    assert r.status_code == 401


async def test_get_registros_is_per_user(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post(
        "/evaluate",
        json={"sefira": "Jésed", "sefira_id": "jesed", "text": "alice ref", "score": 7.0},
        headers=alice["headers"],
    )
    assert r.status_code == 200

    r_alice = await client.get("/registros/jesed", headers=alice["headers"])
    assert r_alice.status_code == 200
    assert len(r_alice.json()) == 1
    assert r_alice.json()[0]["reflexion_texto"] == "alice ref"

    r_bob = await client.get("/registros/jesed", headers=bob["headers"])
    assert r_bob.status_code == 200
    assert r_bob.json() == []


async def test_get_registros_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/registros/jesed")
    assert r.status_code == 401
