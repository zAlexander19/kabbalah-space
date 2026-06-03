import pytest

pytestmark = pytest.mark.asyncio


async def test_list_preguntas_forbidden_for_normal(client, normal_user_headers, seed_sefirot):
    r = await client.get("/admin/preguntas/jesed", headers=normal_user_headers)
    assert r.status_code == 403


async def test_create_pregunta_assigns_incrementing_orden(client, admin_user_headers, seed_sefirot):
    r1 = await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "Primera"}, headers=admin_user_headers)
    assert r1.status_code == 201, r1.text
    assert r1.json()["orden"] == 0

    r2 = await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "Segunda"}, headers=admin_user_headers)
    assert r2.json()["orden"] == 1


async def test_list_preguntas_returns_ordered(client, admin_user_headers, seed_sefirot):
    await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "A"}, headers=admin_user_headers)
    await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "B"}, headers=admin_user_headers)
    r = await client.get("/admin/preguntas/jesed", headers=admin_user_headers)
    assert r.status_code == 200
    textos = [p["texto_pregunta"] for p in r.json()]
    assert textos == ["A", "B"]
