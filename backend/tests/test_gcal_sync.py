"""Tests for gcal_sync orchestration. The HTTP client is mocked via respx."""
import httpx
import pytest
import respx
from cryptography.fernet import Fernet

from gcal_client import CALENDAR_API_BASE, GOOGLE_TOKEN_URL
from gcal_sync import enable_sync_for_user, disable_sync_for_user
from fernet import decrypt_token
from models import Usuario


@pytest.fixture
def fkey() -> str:
    return Fernet.generate_key().decode()


@pytest.mark.asyncio
async def test_enable_sync_creates_calendar_and_stores_refresh_token(
    db_session, google_user, fkey, monkeypatch,
):
    monkeypatch.setattr("gcal_sync.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(
            return_value=httpx.Response(200, json={"access_token": "ya29.fresh", "expires_in": 3600}),
        )
        respx.post(f"{CALENDAR_API_BASE}/calendars").mock(
            return_value=httpx.Response(200, json={"id": "cal_new", "summary": "Kabbalah Space"}),
        )

        await enable_sync_for_user(db_session, google_user.id, refresh_token="1//rtok")

    await db_session.refresh(google_user)
    assert google_user.gcal_sync_enabled is True
    assert google_user.google_calendar_id == "cal_new"
    assert google_user.google_refresh_token_enc is not None
    assert decrypt_token(google_user.google_refresh_token_enc, fkey) == "1//rtok"


@pytest.mark.asyncio
async def test_disable_sync_revokes_and_wipes(
    db_session, google_user, fkey, monkeypatch,
):
    from fernet import encrypt_token
    google_user.gcal_sync_enabled = True
    google_user.google_calendar_id = "cal_abc"
    google_user.google_refresh_token_enc = encrypt_token("1//rtok", fkey)
    await db_session.commit()

    monkeypatch.setattr("gcal_sync.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(
            return_value=httpx.Response(200, json={"access_token": "ya29.fresh"}),
        )
        respx.delete(f"{CALENDAR_API_BASE}/calendars/cal_abc").mock(
            return_value=httpx.Response(204),
        )
        respx.post("https://oauth2.googleapis.com/revoke").mock(
            return_value=httpx.Response(200),
        )

        await disable_sync_for_user(db_session, google_user.id)

    await db_session.refresh(google_user)
    assert google_user.gcal_sync_enabled is False
    assert google_user.google_calendar_id is None
    assert google_user.google_refresh_token_enc is None


def _settings_with(fkey: str):
    """Mock a Settings instance with fernet_key + google_client_* set."""
    class S:
        fernet_key = fkey
        google_client_id = "cid"
        google_client_secret = "csec"
        google_oauth_configured = True
        gcal_sync_configured = True
    return S()
