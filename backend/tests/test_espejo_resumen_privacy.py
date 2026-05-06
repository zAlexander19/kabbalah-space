"""Privacy contract for /espejo/resumen."""
from __future__ import annotations

from httpx import AsyncClient


async def test_resumen_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/espejo/resumen")
    assert r.status_code == 401


async def test_resumen_isolates_users(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post(
        "/evaluate",
        json={"sefira": "Jésed", "sefira_id": "jesed", "text": "alice", "score": 8.0},
        headers=alice["headers"],
    )
    assert r.status_code == 200

    r_alice = await client.get("/espejo/resumen", headers=alice["headers"])
    assert r_alice.status_code == 200
    by_id = {row["sefira_id"]: row for row in r_alice.json()}
    assert by_id["jesed"]["ultima_reflexion_texto"] == "alice"
    assert by_id["jesed"]["score_ia_promedio"] is not None

    r_bob = await client.get("/espejo/resumen", headers=bob["headers"])
    assert r_bob.status_code == 200
    by_id_bob = {row["sefira_id"]: row for row in r_bob.json()}
    assert by_id_bob["jesed"]["ultima_reflexion_texto"] is None
    assert by_id_bob["jesed"]["score_ia_promedio"] is None
