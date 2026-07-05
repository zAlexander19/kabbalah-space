"""Registro solo por Google: el endpoint de registro desaparece y el login de
Google adopta cuentas de email existentes (mismo Gmail)."""
import pytest

from auth import find_or_create_google_user, hash_password
from models import Usuario


@pytest.mark.asyncio
async def test_register_endpoint_removed(client):
    """POST /auth/register ya no existe (no se pueden crear cuentas falsas)."""
    r = await client.post(
        "/auth/register",
        json={"email": "nuevo@example.com", "password": "password1", "nombre": "Nuevo"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_google_login_adopts_existing_email_account(db_session):
    """Si el email de Google coincide con una cuenta de email existente, la
    adopta: mismo id, pasa a provider='google', conserva is_admin y limpia
    el password_hash."""
    existing = Usuario(
        email="dueño@gmail.com",
        nombre="Dueño",
        provider="email",
        password_hash=hash_password("password1"),
        is_admin=True,
    )
    db_session.add(existing)
    await db_session.commit()
    await db_session.refresh(existing)
    original_id = existing.id

    user = await find_or_create_google_user(
        db_session, google_sub="google-sub-xyz", email="dueño@gmail.com", name="Dueño G"
    )

    assert user.id == original_id           # misma cuenta
    assert user.provider == "google"
    assert user.provider_id == "google-sub-xyz"
    assert user.password_hash is None
    assert user.is_admin is True            # conserva admin


@pytest.mark.asyncio
async def test_google_login_creates_new_user_when_no_match(db_session):
    """Sin coincidencia de email, crea una cuenta Google nueva (comportamiento
    original intacto)."""
    user = await find_or_create_google_user(
        db_session, google_sub="sub-nuevo", email="fresco@gmail.com", name="Fresco"
    )
    assert user.provider == "google"
    assert user.provider_id == "sub-nuevo"
    assert user.email == "fresco@gmail.com"
