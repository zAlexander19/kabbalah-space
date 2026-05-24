"""Thin async HTTP wrapper over the Resend API.

Docs: https://resend.com/docs/api-reference/emails/send-email

The kill-switch `settings.emails_enabled` lets us turn off ALL email sends
without removing the integration — useful for incidents and for tests that
don't want to mock Resend.
"""
from typing import Optional
import httpx

from config import Settings


BASE_URL = "https://api.resend.com"
TIMEOUT_SECONDS = 15


class ResendError(Exception):
    """Base for Resend API failures."""


class ResendAuthError(ResendError):
    """401 from Resend — API key is invalid or missing."""


async def send_email(
    settings: Settings,
    *,
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
    headers: Optional[dict] = None,
) -> Optional[str]:
    """Send an email via Resend. Returns the provider message_id, or None if
    the global kill-switch is off.

    Raises:
        ResendAuthError on 401
        ResendError on any other 4xx/5xx
    """
    if not settings.emails_enabled:
        return None

    body = {
        "from": settings.from_email,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text is not None:
        body["text"] = text
    if headers:
        body["headers"] = headers

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as http:
        r = await http.post(
            f"{BASE_URL}/emails",
            json=body,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        )

    if r.status_code == 401:
        raise ResendAuthError("resend auth failed (check RESEND_API_KEY)")
    if r.status_code >= 400:
        raise ResendError(f"resend {r.status_code}: {r.text[:200]}")

    data = r.json()
    return data.get("id")
