"""Privacy contract for /respuestas endpoints."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import PreguntaSefira


@pytest.fixture
async def seeded_pregunta(db_session: AsyncSession, seed_sefirot):
    p = PreguntaSefira(sefira_id="jesed", texto_pregunta="¿Cómo cuidás tu Jésed?")
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


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
