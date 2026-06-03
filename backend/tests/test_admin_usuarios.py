import pytest

pytestmark = pytest.mark.asyncio


async def test_list_usuarios_forbidden_for_normal(client, normal_user_headers):
    r = await client.get("/admin/usuarios", headers=normal_user_headers)
    assert r.status_code == 403


async def test_list_usuarios_returns_fields(client, admin_user_headers):
    r = await client.get("/admin/usuarios", headers=admin_user_headers)
    assert r.status_code == 200
    body = r.json()
    assert "total" in body and "items" in body
    admin = next(u for u in body["items"] if u["email"] == "admin@example.com")
    assert admin["is_admin"] is True
    assert admin["is_premium"] is False
    assert {"id", "nombre", "email", "provider", "fecha_creacion"} <= set(admin.keys())


async def test_list_usuarios_search_filters(client, admin_user_headers, two_users):
    r = await client.get("/admin/usuarios?search=alice", headers=admin_user_headers)
    emails = [u["email"] for u in r.json()["items"]]
    assert "alice@example.com" in emails
    assert "bob@example.com" not in emails
