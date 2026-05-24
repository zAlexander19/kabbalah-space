"""Tests for the Resend HTTP client wrapper."""
import pytest
import respx
from httpx import Response

from emails.client import send_email, ResendError, ResendAuthError


@pytest.fixture
def settings_with_resend(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test-key")
    monkeypatch.setattr(s, "from_email", "Kabbalah <test@test.com>")
    monkeypatch.setattr(s, "emails_enabled", True)
    return s


@pytest.mark.asyncio
async def test_send_email_returns_message_id(settings_with_resend):
    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(
            return_value=Response(200, json={"id": "msg-abc-123"})
        )
        msg_id = await send_email(
            settings_with_resend,
            to="user@x.com",
            subject="hola",
            html="<p>hola</p>",
        )
    assert msg_id == "msg-abc-123"


@pytest.mark.asyncio
async def test_send_email_raises_auth_error_on_401(settings_with_resend):
    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(401, json={"message": "invalid key"}))
        with pytest.raises(ResendAuthError):
            await send_email(settings_with_resend, to="x@x.com", subject="s", html="<p>h</p>")


@pytest.mark.asyncio
async def test_send_email_raises_generic_on_500(settings_with_resend):
    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(500, text="internal error"))
        with pytest.raises(ResendError):
            await send_email(settings_with_resend, to="x@x.com", subject="s", html="<p>h</p>")


@pytest.mark.asyncio
async def test_send_email_kill_switch_returns_none(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test-key")
    monkeypatch.setattr(s, "from_email", "x@x.com")
    monkeypatch.setattr(s, "emails_enabled", False)  # kill switch OFF

    # Should not call Resend at all; returns None.
    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        result = await send_email(s, to="user@x.com", subject="hola", html="<p>hola</p>")
    assert result is None
    assert len(route.calls) == 0


@pytest.mark.asyncio
async def test_send_email_includes_from_and_to_in_body(settings_with_resend):
    """Verify the request body shape matches Resend's API."""
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-1"}))
        await send_email(
            settings_with_resend,
            to="recipient@example.com",
            subject="asunto",
            html="<p>cuerpo</p>",
        )
    assert len(route.calls) == 1
    body_bytes = route.calls[0].request.read()
    import json
    body = json.loads(body_bytes)
    assert body["from"] == "Kabbalah <test@test.com>"
    assert body["to"] == ["recipient@example.com"]
    assert body["subject"] == "asunto"
    assert body["html"] == "<p>cuerpo</p>"
