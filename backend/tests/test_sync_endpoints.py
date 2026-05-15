"""Tests for the /sync/google/* and /sync/* HTTP endpoints."""
import httpx
import pytest
import respx
from cryptography.fernet import Fernet
from urllib.parse import urlparse, parse_qs

from gcal_client import CALENDAR_API_BASE, GOOGLE_TOKEN_URL
from models import Usuario


@pytest.fixture
def fkey() -> str:
    return Fernet.generate_key().decode()


async def _login_google_user(client, db_session, fkey, monkeypatch) -> tuple[Usuario, dict]:
    """Seed a Google user and produce auth headers. Patches gcal_sync's
    get_settings to return a Settings with fernet_key + google creds.
    """
    from jose import jwt
    from config import get_settings

    settings = get_settings()
    class S:
        def __getattr__(self, k):
            return getattr(settings, k, "")
        fernet_key = fkey
        google_client_id = "cid"
        google_client_secret = "csec"
        google_oauth_configured = True
        gcal_sync_configured = True
        jwt_secret = settings.jwt_secret
        jwt_algorithm = settings.jwt_algorithm
        gcal_redirect_uri = "http://localhost:8000/sync/google/callback"
        frontend_url = "http://localhost:5173"
    s = S()
    monkeypatch.setattr("gcal_sync.get_settings", lambda: s)
    monkeypatch.setattr("main.get_settings", lambda: s)

    u = Usuario(
        nombre="Greta", email="greta@example.com",
        provider="google", provider_id="google-sub-123",
        password_hash=None,
    )
    db_session.add(u); await db_session.commit(); await db_session.refresh(u)

    token = jwt.encode({"sub": u.id}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return u, {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_authorize_returns_google_url_with_offline_access(
    client, db_session, fkey, monkeypatch,
):
    _, headers = await _login_google_user(client, db_session, fkey, monkeypatch)
    r = await client.get("/sync/google/authorize", headers=headers)
    assert r.status_code == 200, r.text
    url = r.json()["url"]

    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    assert qs["access_type"] == ["offline"]
    assert qs["prompt"] == ["consent"]
    assert "calendar" in qs["scope"][0]


@pytest.mark.asyncio
async def test_authorize_rejects_email_provider_user(
    client, db_session, fkey, monkeypatch,
):
    """Email users can't connect Google Calendar in v1."""
    from config import get_settings
    from jose import jwt
    settings = get_settings()

    class S:
        def __getattr__(self, k):
            return getattr(settings, k, "")
        fernet_key = fkey
        google_client_id = "cid"
        google_client_secret = "csec"
        google_oauth_configured = True
        gcal_sync_configured = True
        jwt_secret = settings.jwt_secret
        jwt_algorithm = settings.jwt_algorithm
        gcal_redirect_uri = "http://localhost:8000/sync/google/callback"
        frontend_url = "http://localhost:5173"
    monkeypatch.setattr("main.get_settings", lambda: S())

    u = Usuario(nombre="Bob", email="bob@example.com", provider="email", password_hash="hash")
    db_session.add(u); await db_session.commit(); await db_session.refresh(u)
    from jose import jwt
    token = jwt.encode({"sub": u.id}, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    r = await client.get("/sync/google/authorize", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_disconnect_wipes_user_columns(
    client, db_session, fkey, monkeypatch,
):
    user, headers = await _login_google_user(client, db_session, fkey, monkeypatch)
    from fernet import encrypt_token
    user.gcal_sync_enabled = True
    user.google_calendar_id = "cal_abc"
    user.google_refresh_token_enc = encrypt_token("1//rtok", fkey)
    await db_session.commit()

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        respx.delete(f"{CALENDAR_API_BASE}/calendars/cal_abc").mock(return_value=httpx.Response(204))
        respx.post("https://oauth2.googleapis.com/revoke").mock(return_value=httpx.Response(200))

        r = await client.post("/sync/google/disconnect", headers=headers)
        assert r.status_code == 200

    await db_session.refresh(user)
    assert user.gcal_sync_enabled is False
    assert user.google_calendar_id is None
    assert user.google_refresh_token_enc is None


from models import Actividad
from datetime import datetime, timezone


@pytest.mark.asyncio
async def test_status_returns_counts(
    client, db_session, fkey, monkeypatch,
):
    user, headers = await _login_google_user(client, db_session, fkey, monkeypatch)
    user.gcal_sync_enabled = True
    user.google_calendar_id = "cal_abc"
    await db_session.commit()

    # 2 pending, 1 error, 3 synced
    for i in range(2):
        db_session.add(Actividad(usuario_id=user.id, titulo=f"P{i}",
            inicio=datetime(2026,5,15,8,0,tzinfo=timezone.utc),
            fin=datetime(2026,5,15,9,0,tzinfo=timezone.utc),
            sync_status="pending"))
    db_session.add(Actividad(usuario_id=user.id, titulo="E",
        inicio=datetime(2026,5,15,8,0,tzinfo=timezone.utc),
        fin=datetime(2026,5,15,9,0,tzinfo=timezone.utc),
        sync_status="error"))
    for i in range(3):
        db_session.add(Actividad(usuario_id=user.id, titulo=f"S{i}",
            inicio=datetime(2026,5,15,8,0,tzinfo=timezone.utc),
            fin=datetime(2026,5,15,9,0,tzinfo=timezone.utc),
            sync_status="synced"))
    await db_session.commit()

    r = await client.get("/sync/status", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True
    assert body["pending_count"] == 2
    assert body["error_count"] == 1
    assert body["calendar_name"] == "Kabbalah Space"


@pytest.mark.asyncio
async def test_status_disabled_user(
    client, db_session, fkey, monkeypatch,
):
    user, headers = await _login_google_user(client, db_session, fkey, monkeypatch)
    r = await client.get("/sync/status", headers=headers)
    body = r.json()
    assert body["enabled"] is False


@pytest.mark.asyncio
async def test_retry_sync_resets_status_and_schedules(
    client, db_session, fkey, monkeypatch,
):
    user, headers = await _login_google_user(client, db_session, fkey, monkeypatch)
    from fernet import encrypt_token
    user.gcal_sync_enabled = True
    user.google_calendar_id = "cal_abc"
    user.google_refresh_token_enc = encrypt_token("1//rtok", fkey)
    await db_session.commit()

    act = Actividad(usuario_id=user.id, titulo="X",
        inicio=datetime(2026,5,15,8,0,tzinfo=timezone.utc),
        fin=datetime(2026,5,15,9,0,tzinfo=timezone.utc),
        sync_status="error")
    db_session.add(act); await db_session.commit(); await db_session.refresh(act)

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        respx.post(f"{CALENDAR_API_BASE}/calendars/cal_abc/events").mock(
            return_value=httpx.Response(200, json={"id": "evt_retry"}),
        )

        r = await client.post(f"/actividades/{act.id}/retry-sync", headers=headers)
        assert r.status_code == 200

    await db_session.refresh(act)
    # BackgroundTask runs synchronously in tests
    assert act.sync_status == "synced"
    assert act.gcal_event_id == "evt_retry"
