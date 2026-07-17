import pytest

pytestmark = pytest.mark.asyncio


async def test_list_sefirot_forbidden_for_normal(client, normal_user_headers, seed_sefirot):
    r = await client.get("/admin/sefirot", headers=normal_user_headers)
    assert r.status_code == 403


async def test_list_sefirot_returns_all_with_content_fields(client, admin_user_headers, seed_sefirot):
    r = await client.get("/admin/sefirot", headers=admin_user_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) >= 1
    item = body[0]
    assert {"id", "nombre", "esencia", "palabras_clave", "que_observa"} <= set(item.keys())
    assert isinstance(item["palabras_clave"], list)  # null -> [] normalizado


async def test_patch_sefira_updates_and_persists(client, admin_user_headers, seed_sefirot):
    r = await client.patch(
        "/admin/sefirot/jesed",
        json={"esencia": "Nueva esencia", "palabras_clave": ["Amor", "Entrega"], "que_observa": "Qué mirar"},
        headers=admin_user_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["esencia"] == "Nueva esencia"
    assert body["palabras_clave"] == ["Amor", "Entrega"]
    # persiste
    r2 = await client.get("/admin/sefirot", headers=admin_user_headers)
    jesed = next(s for s in r2.json() if s["id"] == "jesed")
    assert jesed["esencia"] == "Nueva esencia"
    assert jesed["palabras_clave"] == ["Amor", "Entrega"]


async def test_patch_sefira_partial_only_touches_given_fields(client, admin_user_headers, seed_sefirot):
    await client.patch("/admin/sefirot/jesed",
        json={"esencia": "E1", "palabras_clave": ["A"], "que_observa": "Q1"}, headers=admin_user_headers)
    await client.patch("/admin/sefirot/jesed",
        json={"esencia": "E2"}, headers=admin_user_headers)
    r = await client.get("/admin/sefirot", headers=admin_user_headers)
    jesed = next(s for s in r.json() if s["id"] == "jesed")
    assert jesed["esencia"] == "E2"
    assert jesed["palabras_clave"] == ["A"]  # intacto
    assert jesed["que_observa"] == "Q1"      # intacto


async def test_patch_sefira_404_unknown(client, admin_user_headers, seed_sefirot):
    r = await client.patch("/admin/sefirot/nope", json={"esencia": "x"}, headers=admin_user_headers)
    assert r.status_code == 404
