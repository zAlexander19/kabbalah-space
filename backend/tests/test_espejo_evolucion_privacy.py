"""Privacy contract for /espejo/evolucion."""
from __future__ import annotations

from httpx import AsyncClient


async def test_evolucion_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/espejo/evolucion?meses=12")
    assert r.status_code == 401


async def test_evolucion_isolates_users(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post(
        "/evaluate",
        json={"sefira": "Jésed", "sefira_id": "jesed", "text": "alice", "score": 7.0},
        headers=alice["headers"],
    )
    assert r.status_code == 200

    r_alice = await client.get("/espejo/evolucion?meses=3", headers=alice["headers"])
    alice_jesed = next(row for row in r_alice.json() if row["sefira_id"] == "jesed")
    total_alice = sum(m["reflexiones"] for m in alice_jesed["meses"])
    assert total_alice == 1

    r_bob = await client.get("/espejo/evolucion?meses=3", headers=bob["headers"])
    bob_jesed = next(row for row in r_bob.json() if row["sefira_id"] == "jesed")
    total_bob = sum(m["reflexiones"] for m in bob_jesed["meses"])
    assert total_bob == 0
