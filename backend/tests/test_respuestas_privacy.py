"""Privacy contract for /respuestas endpoints."""
from __future__ import annotations

from httpx import AsyncClient


async def test_post_respuesta_requires_auth(client: AsyncClient, seeded_pregunta):
    r = await client.post("/respuestas", json={
        "pregunta_id": seeded_pregunta.id,
        "respuesta_texto": "anon attempt",
    })
    assert r.status_code == 401


async def test_post_respuesta_persists_usuario_id(client: AsyncClient, seeded_pregunta, two_users):
    alice = two_users["alice"]
    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "alice's reflection"},
        headers=alice["headers"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["usuario_id"] == alice["id"]


async def test_cooldown_is_per_user(client: AsyncClient, seeded_pregunta, two_users):
    """Alice answering does NOT block Bob from answering the same question."""
    alice, bob = two_users["alice"], two_users["bob"]

    r1 = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "alice"},
        headers=alice["headers"],
    )
    assert r1.status_code == 200

    # Alice gets 409 if she tries again (her own cooldown applies)
    r_dup = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "alice2"},
        headers=alice["headers"],
    )
    assert r_dup.status_code == 409

    # Bob is unaffected
    r2 = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "bob"},
        headers=bob["headers"],
    )
    assert r2.status_code == 200, r2.text


async def test_get_respuestas_state_is_per_user(client: AsyncClient, seeded_pregunta, two_users):
    """After Alice answers, Alice sees the question as blocked but Bob sees it fresh."""
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "alice"},
        headers=alice["headers"],
    )
    assert r.status_code == 200

    r_alice = await client.get("/respuestas/jesed", headers=alice["headers"])
    assert r_alice.status_code == 200
    alice_pregunta = next(p for p in r_alice.json() if p["pregunta_id"] == seeded_pregunta.id)
    assert alice_pregunta["bloqueada"] is True
    assert alice_pregunta["ultima_respuesta"] == "alice"

    r_bob = await client.get("/respuestas/jesed", headers=bob["headers"])
    assert r_bob.status_code == 200
    bob_pregunta = next(p for p in r_bob.json() if p["pregunta_id"] == seeded_pregunta.id)
    assert bob_pregunta["bloqueada"] is False
    assert bob_pregunta["ultima_respuesta"] is None


async def test_get_respuestas_state_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/respuestas/jesed")
    assert r.status_code == 401
