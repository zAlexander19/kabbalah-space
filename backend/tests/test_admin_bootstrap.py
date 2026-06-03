import pytest
from sqlalchemy import select

pytestmark = pytest.mark.asyncio


async def test_bootstrap_promotes_listed_emails(db_session, monkeypatch):
    from models import Usuario
    from admin.bootstrap import promote_bootstrap_admins

    u = Usuario(nombre="Owner", email="owner@example.com", provider="email", password_hash="x")
    db_session.add(u)
    await db_session.commit()

    await promote_bootstrap_admins(db_session, "owner@example.com, other@example.com")

    refreshed = (await db_session.execute(
        select(Usuario).where(Usuario.email == "owner@example.com")
    )).scalars().first()
    assert refreshed.is_admin is True


async def test_bootstrap_empty_string_is_noop(db_session):
    from admin.bootstrap import promote_bootstrap_admins
    # No debe romper con string vacio
    await promote_bootstrap_admins(db_session, "")
