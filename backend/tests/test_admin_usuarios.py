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


async def test_promote_and_demote_admin(client, admin_user_headers, normal_user_headers, db_session):
    from sqlalchemy import select
    from models import Usuario
    normal = (await db_session.execute(
        select(Usuario).where(Usuario.email == "normal@example.com")
    )).scalars().first()

    r = await client.post(f"/admin/usuarios/{normal.id}/admin", headers=admin_user_headers)
    assert r.status_code == 200, r.text

    r2 = await client.delete(f"/admin/usuarios/{normal.id}/admin", headers=admin_user_headers)
    assert r2.status_code == 200


async def test_cannot_demote_self(client, admin_user_headers, db_session):
    from sqlalchemy import select
    from models import Usuario
    me = (await db_session.execute(
        select(Usuario).where(Usuario.email == "admin@example.com")
    )).scalars().first()
    r = await client.delete(f"/admin/usuarios/{me.id}/admin", headers=admin_user_headers)
    assert r.status_code == 400


async def test_cannot_demote_last_admin(client, admin_user_headers, normal_user_headers, db_session):
    from sqlalchemy import select
    from models import Usuario
    me = (await db_session.execute(
        select(Usuario).where(Usuario.email == "admin@example.com")
    )).scalars().first()
    r = await client.delete(f"/admin/usuarios/{me.id}/admin", headers=admin_user_headers)
    assert r.status_code == 400
