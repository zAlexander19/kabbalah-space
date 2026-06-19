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


async def test_is_admin_server_default_materializes_false(db_session):
    """Regresión: el server_default de is_admin debe rendir un boolean False real,
    no el string 'false'. En SQLite, server_default='false' (string) guardaba el
    texto literal, que se lee como truthy -> todos quedaban admin. Insertamos una
    fila por SQL crudo SIN is_admin (forzando el server_default) y verificamos que
    el ORM la lee como False."""
    from sqlalchemy import text, select
    from models import Usuario
    await db_session.execute(text(
        "INSERT INTO usuarios (id, nombre, email, provider) "
        "VALUES ('u-default-test', 'Default', 'default-test@example.com', 'email')"
    ))
    await db_session.commit()
    u = (await db_session.execute(
        select(Usuario).where(Usuario.id == 'u-default-test')
    )).scalars().first()
    assert u.is_admin is False
