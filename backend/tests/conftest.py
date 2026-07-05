"""Pytest fixtures for backend tests.

Each test gets:
  - A fresh in-memory SQLite DB
  - A FastAPI test app with overridden get_db
  - An httpx.AsyncClient bound to that app
  - Helpers to register and authenticate users
"""
from __future__ import annotations

from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base, get_db
from main import app
from models import PreguntaSefira, Sefira
from billing.models import Subscription  # Ensure Subscription is in the registry
from emails.models import EmailLog  # noqa: F401 — register email_log for in-memory test DB
from rate_limit import limiter


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """El limiter es estado global del proceso; sin esto, los hits de un test
    contaminan al siguiente (p.ej. registros repetidos desde la misma IP)."""
    limiter.reset()
    yield


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session_maker(engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


@pytest_asyncio.fixture
async def db_session(session_maker) -> AsyncGenerator[AsyncSession, None]:
    """Direct DB session for seeding fixtures."""
    async with session_maker() as s:
        yield s


@pytest_asyncio.fixture
async def client(session_maker, monkeypatch) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client with get_db overridden to share the test engine.

    Also patches database.get_session_factory (used by BackgroundTasks in
    gcal-sync endpoints) so background tasks hit the same in-memory DB.
    """
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_maker() as s:
            yield s

    app.dependency_overrides[get_db] = override_get_db

    import database
    monkeypatch.setattr(database, "AsyncSessionLocal", session_maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def seed_sefirot(db_session: AsyncSession):
    """Insert minimum sefirot rows to satisfy FKs in tests."""
    sefirot = [
        Sefira(id="keter", nombre="Keter", pilar="centro", descripcion=""),
        Sefira(id="jesed", nombre="Jésed", pilar="derecha", descripcion=""),
        Sefira(id="tiferet", nombre="Tiféret", pilar="centro", descripcion=""),
    ]
    for s in sefirot:
        db_session.add(s)
    await db_session.commit()
    return sefirot


async def register_and_login(db: AsyncSession, email: str, password: str, nombre: str) -> dict:
    """Helper: crea un usuario de email+contraseña y devuelve auth bundle.

    El registro público (POST /auth/register) fue eliminado — las cuentas
    nuevas se crean solo por Google. Para los tests seguimos necesitando
    usuarios de email, así que los insertamos DIRECTO en la DB (misma sesión
    in-memory que comparte el client) y firmamos el JWT con create_access_token.
    """
    from auth import create_access_token, hash_password
    from config import get_settings
    from models import Usuario

    user = Usuario(
        email=email,
        nombre=nombre.strip(),
        password_hash=hash_password(password),
        provider="email",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, get_settings())
    return {
        "id": user.id,
        "email": email,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }


@pytest_asyncio.fixture
async def two_users(client: AsyncClient, db_session):
    """Register two users A and B; return both auth bundles."""
    a = await register_and_login(db_session, "alice@example.com", "password1", "Alice")
    b = await register_and_login(db_session, "bob@example.com",   "password2", "Bob")
    return {"alice": a, "bob": b}


@pytest_asyncio.fixture
async def seeded_pregunta(db_session: AsyncSession, seed_sefirot):
    p = PreguntaSefira(sefira_id="jesed", texto_pregunta="¿Cómo cuidás tu Jésed?")
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def google_user(db_session: AsyncSession):
    """Seed a provider='google' user with sync NOT yet enabled."""
    from models import Usuario
    u = Usuario(
        nombre="Greta Garbo",
        email="greta@example.com",
        provider="google",
        provider_id="google-sub-123",
        password_hash=None,
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest_asyncio.fixture
async def free_user_headers(client: AsyncClient, db_session) -> dict:
    """Auth headers for a fresh email user without subscription (free tier)."""
    bundle = await register_and_login(db_session, "free@example.com", "secret123", "Free")
    return bundle["headers"]


@pytest_asyncio.fixture
async def premium_user_headers(client: AsyncClient, db_session) -> dict:
    """Auth headers for a user with an active Subscription row (premium tier)."""
    from datetime import datetime, timedelta, timezone
    from billing.models import Subscription

    bundle = await register_and_login(db_session, "premium@example.com", "secret123", "Premium")
    user_id = bundle["id"]

    sub = Subscription(
        usuario_id=user_id,
        status="active",
        plan="monthly",
        lemonsqueezy_subscription_id=f"ls-test-{user_id}",
        lemonsqueezy_customer_id=f"lc-test-{user_id}",
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db_session.add(sub)
    await db_session.commit()

    # Also seed EmailPreferences (normally done by subscription_created webhook handler)
    from billing.models import EmailPreferences
    prefs = EmailPreferences(usuario_id=user_id)
    db_session.add(prefs)
    await db_session.commit()

    return bundle["headers"]


@pytest_asyncio.fixture
async def admin_user_headers(client, db_session) -> dict:
    """Auth headers de un usuario con is_admin=True."""
    from sqlalchemy import select
    from models import Usuario
    bundle = await register_and_login(db_session, "admin@example.com", "secret123", "Admin")
    user = (await db_session.execute(
        select(Usuario).where(Usuario.id == bundle["id"])
    )).scalars().first()
    user.is_admin = True
    await db_session.commit()
    return bundle["headers"]


@pytest_asyncio.fixture
async def normal_user_headers(client, db_session) -> dict:
    bundle = await register_and_login(db_session, "normal@example.com", "secret123", "Normal")
    return bundle["headers"]
