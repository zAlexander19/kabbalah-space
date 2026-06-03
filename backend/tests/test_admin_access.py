import pytest

pytestmark = pytest.mark.asyncio


async def test_admin_ping_requires_auth(client):
    r = await client.get("/admin/ping")
    assert r.status_code == 401


async def test_admin_ping_forbidden_for_normal_user(client, normal_user_headers):
    r = await client.get("/admin/ping", headers=normal_user_headers)
    assert r.status_code == 403


async def test_admin_ping_ok_for_admin(client, admin_user_headers):
    r = await client.get("/admin/ping", headers=admin_user_headers)
    assert r.status_code == 200
    assert r.json() == {"ok": True}
