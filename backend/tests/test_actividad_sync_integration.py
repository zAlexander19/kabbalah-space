"""Tests verifying POST/PUT/DELETE /actividades schedule sync tasks when enabled."""
import httpx
import pytest
import respx
from datetime import datetime, timezone
from cryptography.fernet import Fernet

from gcal_client import CALENDAR_API_BASE, GOOGLE_TOKEN_URL
from models import Usuario, Actividad


@pytest.fixture
def fkey() -> str:
    return Fernet.generate_key().decode()


async def _setup_synced_user(client, db_session, fkey, monkeypatch):
    """Create google user with sync_enabled + return auth headers."""
    from jose import jwt
    from config import get_settings
    from fernet import encrypt_token

    settings = get_settings()
    class S:
        def __getattr__(self, k): return getattr(settings, k, "")
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

    u = Usuario(nombre="G", email="g@example.com", provider="google", provider_id="sub")
    u.gcal_sync_enabled = True
    u.google_calendar_id = "cal_abc"
    u.google_refresh_token_enc = encrypt_token("1//rtok", fkey)
    db_session.add(u); await db_session.commit(); await db_session.refresh(u)
    token = jwt.encode({"sub": u.id}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return u, {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_actividad_pushes_to_google(
    client, db_session, fkey, monkeypatch, seed_sefirot,
):
    user, headers = await _setup_synced_user(client, db_session, fkey, monkeypatch)

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        insert_route = respx.post(f"{CALENDAR_API_BASE}/calendars/cal_abc/events").mock(
            return_value=httpx.Response(200, json={"id": "evt_new"}),
        )

        r = await client.post("/actividades", headers=headers, json={
            "titulo": "Meditation",
            "inicio": "2026-05-15T08:00:00Z",
            "fin": "2026-05-15T09:00:00Z",
            "sefirot_ids": ["jesed"],
        })
        assert r.status_code == 200, r.text
        assert insert_route.called


@pytest.mark.asyncio
async def test_create_series_pushes_only_master(
    client, db_session, fkey, monkeypatch, seed_sefirot,
):
    user, headers = await _setup_synced_user(client, db_session, fkey, monkeypatch)

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        insert_route = respx.post(f"{CALENDAR_API_BASE}/calendars/cal_abc/events").mock(
            return_value=httpx.Response(200, json={"id": "evt_master"}),
        )

        r = await client.post("/actividades", headers=headers, json={
            "titulo": "Weekly meditation",
            "inicio": "2026-05-18T08:00:00Z",  # Monday
            "fin": "2026-05-18T09:00:00Z",
            "sefirot_ids": ["jesed"],
            "rrule": "FREQ=WEEKLY;COUNT=4",
        })
        assert r.status_code == 200, r.text
        # 4 instances created but only the master should be pushed
        assert insert_route.call_count == 1


@pytest.mark.asyncio
async def test_delete_actividad_calls_google_delete(
    client, db_session, fkey, monkeypatch, seed_sefirot,
):
    user, headers = await _setup_synced_user(client, db_session, fkey, monkeypatch)
    a = Actividad(
        usuario_id=user.id, titulo="X",
        inicio=datetime(2026,5,15,8,0,tzinfo=timezone.utc),
        fin=datetime(2026,5,15,9,0,tzinfo=timezone.utc),
        gcal_event_id="evt_xyz", sync_status="synced",
    )
    db_session.add(a); await db_session.commit(); await db_session.refresh(a)

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        del_route = respx.delete(f"{CALENDAR_API_BASE}/calendars/cal_abc/events/evt_xyz").mock(
            return_value=httpx.Response(204),
        )

        r = await client.delete(f"/actividades/{a.id}", headers=headers)
        assert r.status_code == 200
        assert del_route.called


@pytest.mark.asyncio
async def test_create_actividad_no_sync_when_disabled(
    client, db_session, fkey, monkeypatch, seed_sefirot, two_users,
):
    """Email user with sync disabled: no Google calls happen at all."""
    headers = two_users["alice"]["headers"]

    with respx.mock:
        # If anything tries to hit Google, the test will fail because we
        # didn't register a route.
        r = await client.post("/actividades", headers=headers, json={
            "titulo": "Local only",
            "inicio": "2026-05-15T08:00:00Z",
            "fin": "2026-05-15T09:00:00Z",
            "sefirot_ids": ["jesed"],
        })
        assert r.status_code == 200
