"""POST /reflexiones-libres: 1/month for free, unlimited for premium."""
import pytest


@pytest.mark.asyncio
async def test_free_user_can_create_first_reflexion(client, free_user_headers, seed_sefirot):
    r = await client.post(
        "/reflexiones-libres",
        json={"tipo": "sefira", "sefira_id": "jesed", "contenido": "primera"},
        headers=free_user_headers,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["tipo"] == "sefira"
    assert body["sefira_id"] == "jesed"
    assert body["contenido"] == "primera"


@pytest.mark.asyncio
async def test_free_user_blocked_on_second_reflexion_same_month(client, free_user_headers, seed_sefirot):
    await client.post(
        "/reflexiones-libres",
        json={"tipo": "arbol", "contenido": "primera"},
        headers=free_user_headers,
    )
    r = await client.post(
        "/reflexiones-libres",
        json={"tipo": "arbol", "contenido": "segunda"},
        headers=free_user_headers,
    )
    assert r.status_code == 402, r.text
    assert r.json()["detail"]["reason"] == "free_reflection_limit"


@pytest.mark.asyncio
async def test_premium_can_create_many(client, premium_user_headers, seed_sefirot):
    for i in range(5):
        r = await client.post(
            "/reflexiones-libres",
            json={"tipo": "sefira", "sefira_id": "jesed", "contenido": f"r{i}"},
            headers=premium_user_headers,
        )
        assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_tipo_sefira_requires_sefira_id(client, premium_user_headers):
    """tipo='sefira' without sefira_id must 422."""
    r = await client.post(
        "/reflexiones-libres",
        json={"tipo": "sefira", "contenido": "x"},
        headers=premium_user_headers,
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_invalid_tipo_rejected(client, premium_user_headers):
    r = await client.post(
        "/reflexiones-libres",
        json={"tipo": "otra-cosa", "contenido": "x"},
        headers=premium_user_headers,
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_arbol_does_not_require_sefira_id(client, premium_user_headers):
    """tipo='arbol' works without sefira_id."""
    r = await client.post(
        "/reflexiones-libres",
        json={"tipo": "arbol", "contenido": "reflexion de arbol completo"},
        headers=premium_user_headers,
    )
    assert r.status_code == 201, r.text
    assert r.json()["sefira_id"] is None
