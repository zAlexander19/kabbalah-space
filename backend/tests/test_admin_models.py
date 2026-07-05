import pytest

pytestmark = pytest.mark.asyncio


async def test_new_user_defaults_is_admin_false(db_session):
    # El registro por email fue eliminado; las cuentas nuevas nacen igual con
    # is_admin=False. Creamos un usuario directo y verificamos el default.
    from models import Usuario
    u = Usuario(
        email="nb@example.com", nombre="NB",
        provider="google", provider_id="sub-nb", password_hash=None,
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    assert u.is_admin is False


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
