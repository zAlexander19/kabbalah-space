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


async def test_edit_pregunta_updates_texto(client, admin_user_headers, seed_sefirot):
    r = await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "Vieja"}, headers=admin_user_headers)
    pid = r.json()["id"]
    r2 = await client.patch(f"/admin/preguntas/{pid}",
        json={"texto": "Nueva"}, headers=admin_user_headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["texto_pregunta"] == "Nueva"


async def test_edit_pregunta_404_unknown(client, admin_user_headers, seed_sefirot):
    r = await client.patch("/admin/preguntas/nope",
        json={"texto": "x"}, headers=admin_user_headers)
    assert r.status_code == 404


async def test_delete_pregunta(client, admin_user_headers, seed_sefirot):
    r = await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "Borrar"}, headers=admin_user_headers)
    pid = r.json()["id"]
    r2 = await client.delete(f"/admin/preguntas/{pid}", headers=admin_user_headers)
    assert r2.status_code == 200
    r3 = await client.get("/admin/preguntas/jesed", headers=admin_user_headers)
    assert all(p["id"] != pid for p in r3.json())


async def test_reorder_preguntas(client, admin_user_headers, seed_sefirot):
    ids = []
    for texto in ["A", "B", "C"]:
        r = await client.post("/admin/preguntas",
            json={"sefira_id": "jesed", "texto": texto}, headers=admin_user_headers)
        ids.append(r.json()["id"])
    reordered = list(reversed(ids))
    r = await client.put("/admin/preguntas/jesed/orden",
        json={"ids": reordered}, headers=admin_user_headers)
    assert r.status_code == 200, r.text
    r2 = await client.get("/admin/preguntas/jesed", headers=admin_user_headers)
    assert [p["id"] for p in r2.json()] == reordered


async def test_reorder_rejects_mismatched_ids(client, admin_user_headers, seed_sefirot):
    r = await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "A"}, headers=admin_user_headers)
    pid = r.json()["id"]
    r2 = await client.put("/admin/preguntas/jesed/orden",
        json={"ids": [pid, "fantasma"]}, headers=admin_user_headers)
    assert r2.status_code == 400


async def test_public_get_preguntas_is_ordered(client, admin_user_headers, seed_sefirot):
    for texto in ["A", "B"]:
        await client.post("/admin/preguntas",
            json={"sefira_id": "jesed", "texto": texto}, headers=admin_user_headers)
    # GET publico (sin auth) sigue existiendo para el modulo Espejo, ahora ordenado
    r = await client.get("/preguntas/jesed")
    assert r.status_code == 200
    assert [p["texto_pregunta"] for p in r.json()] == ["A", "B"]


async def test_old_open_post_pregunta_is_gone(client, seed_sefirot):
    # El POST abierto sin auth ya no debe existir.
    # FastAPI devuelve 404 porque no hay ninguna ruta POST /preguntas (sin path param).
    r = await client.post("/preguntas", json={"sefira_id": "jesed", "texto": "x"})
    assert r.status_code in (404, 405)
