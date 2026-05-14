"""Tests for the Google Calendar HTTP client wrapper."""
import httpx
import pytest
import respx

from gcal_client import (
    GcalAuthError,
    GcalNotFoundError,
    GcalRateLimitError,
    GcalTransientError,
    refresh_access_token,
)


@pytest.mark.asyncio
async def test_refresh_access_token_success():
    with respx.mock:
        respx.post("https://oauth2.googleapis.com/token").mock(
            return_value=httpx.Response(200, json={"access_token": "ya29.fresh", "expires_in": 3600}),
        )
        token = await refresh_access_token("1//refresh-token", client_id="cid", client_secret="csec")
        assert token == "ya29.fresh"


@pytest.mark.asyncio
async def test_refresh_access_token_401_raises_auth_error():
    with respx.mock:
        respx.post("https://oauth2.googleapis.com/token").mock(
            return_value=httpx.Response(401, json={"error": "invalid_grant"}),
        )
        with pytest.raises(GcalAuthError):
            await refresh_access_token("1//revoked", client_id="cid", client_secret="csec")


@pytest.mark.asyncio
async def test_refresh_access_token_400_invalid_grant_raises_auth_error():
    """invalid_grant on 400 means the refresh_token was revoked — treat as auth error."""
    with respx.mock:
        respx.post("https://oauth2.googleapis.com/token").mock(
            return_value=httpx.Response(400, json={"error": "invalid_grant"}),
        )
        with pytest.raises(GcalAuthError):
            await refresh_access_token("1//revoked", client_id="cid", client_secret="csec")
