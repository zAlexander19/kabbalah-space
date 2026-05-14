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


from gcal_client import (
    create_calendar,
    delete_calendar,
    insert_event,
    update_event,
    delete_event,
    revoke_refresh_token,
    CALENDAR_API_BASE,
)


@pytest.mark.asyncio
async def test_create_calendar_returns_id_and_summary():
    with respx.mock:
        respx.post(f"{CALENDAR_API_BASE}/calendars").mock(
            return_value=httpx.Response(200, json={"id": "cal_abc", "summary": "Kabbalah Space"}),
        )
        result = await create_calendar(access_token="tok", summary="Kabbalah Space")
        assert result == {"id": "cal_abc", "summary": "Kabbalah Space"}


@pytest.mark.asyncio
async def test_delete_calendar():
    with respx.mock:
        route = respx.delete(f"{CALENDAR_API_BASE}/calendars/cal_abc").mock(
            return_value=httpx.Response(204),
        )
        await delete_calendar(access_token="tok", calendar_id="cal_abc")
        assert route.called


@pytest.mark.asyncio
async def test_delete_calendar_404_raises_not_found():
    with respx.mock:
        respx.delete(f"{CALENDAR_API_BASE}/calendars/cal_gone").mock(
            return_value=httpx.Response(404),
        )
        with pytest.raises(GcalNotFoundError):
            await delete_calendar(access_token="tok", calendar_id="cal_gone")


@pytest.mark.asyncio
async def test_insert_event():
    event = {"summary": "Meditate", "start": {"dateTime": "2026-05-15T08:00:00Z"}, "end": {"dateTime": "2026-05-15T09:00:00Z"}}
    with respx.mock:
        respx.post(f"{CALENDAR_API_BASE}/calendars/cal_abc/events").mock(
            return_value=httpx.Response(200, json={"id": "evt_1", **event}),
        )
        result = await insert_event(access_token="tok", calendar_id="cal_abc", event=event)
        assert result["id"] == "evt_1"


@pytest.mark.asyncio
async def test_update_event():
    event = {"summary": "Meditate (edited)"}
    with respx.mock:
        respx.put(f"{CALENDAR_API_BASE}/calendars/cal_abc/events/evt_1").mock(
            return_value=httpx.Response(200, json={"id": "evt_1", **event}),
        )
        result = await update_event(access_token="tok", calendar_id="cal_abc", event_id="evt_1", event=event)
        assert result["summary"] == "Meditate (edited)"


@pytest.mark.asyncio
async def test_delete_event_404_raises_not_found():
    with respx.mock:
        respx.delete(f"{CALENDAR_API_BASE}/calendars/cal_abc/events/evt_gone").mock(
            return_value=httpx.Response(404),
        )
        with pytest.raises(GcalNotFoundError):
            await delete_event(access_token="tok", calendar_id="cal_abc", event_id="evt_gone")


@pytest.mark.asyncio
async def test_revoke_refresh_token():
    with respx.mock:
        route = respx.post("https://oauth2.googleapis.com/revoke").mock(
            return_value=httpx.Response(200),
        )
        await revoke_refresh_token("1//abc")
        assert route.called
