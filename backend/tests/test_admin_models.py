import pytest

pytestmark = pytest.mark.asyncio


async def test_new_user_defaults_is_admin_false(client):
    r = await client.post("/auth/register", json={
        "email": "nb@example.com", "password": "password1", "nombre": "NB",
    })
    assert r.status_code in (200, 201), r.text
    # UserOut debe exponer is_admin, por defecto False
    assert r.json()["is_admin"] is False


async def test_pregunta_has_orden_column(db_session, seed_sefirot):
    from models import PreguntaSefira
    from sqlalchemy import select
    p = PreguntaSefira(sefira_id="jesed", texto_pregunta="x", orden=3)
    db_session.add(p)
    await db_session.commit()
    row = (await db_session.execute(select(PreguntaSefira))).scalars().first()
    assert row.orden == 3
