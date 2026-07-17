import pytest

pytestmark = pytest.mark.asyncio


async def test_contenido_publico_no_auth_returns_items(client, seed_sefirot):
    # sin headers de auth
    r = await client.get("/sefirot/contenido")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list) and len(body) >= 1
    item = body[0]
    assert {"id", "esencia", "palabras_clave", "que_observa"} <= set(item.keys())
    assert isinstance(item["palabras_clave"], list)


async def test_contenido_publico_reflects_admin_edit(client, admin_user_headers, seed_sefirot):
    await client.patch("/admin/sefirot/jesed",
        json={"esencia": "Editada", "palabras_clave": ["X"]}, headers=admin_user_headers)
    r = await client.get("/sefirot/contenido")
    jesed = next(s for s in r.json() if s["id"] == "jesed")
    assert jesed["esencia"] == "Editada"
    assert jesed["palabras_clave"] == ["X"]
