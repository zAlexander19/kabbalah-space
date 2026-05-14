"""Thin async HTTP wrapper over the Google Calendar API.

This module knows nothing about the DB or FastAPI — it only deals with HTTP
requests and translates Google's responses into typed Python exceptions.
Callers (gcal_sync) handle the business logic of what to do on each error.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"

# Retry configuration for 429 and 5xx. Exponential backoff capped at 5 attempts.
MAX_ATTEMPTS = 5
BASE_BACKOFF_SECONDS = 1.0


class GcalError(Exception):
    """Base class for all Google Calendar errors."""


class GcalAuthError(GcalError):
    """401 on a token or refresh attempt — refresh_token is revoked/invalid."""


class GcalNotFoundError(GcalError):
    """404 — calendar or event does not exist on Google's side."""


class GcalRateLimitError(GcalError):
    """429 — exhausted retries on rate limit."""


class GcalTransientError(GcalError):
    """5xx — exhausted retries on Google-side transient failure."""


def _is_invalid_grant(resp: httpx.Response) -> bool:
    """Google returns 400 invalid_grant when a refresh_token is revoked."""
    if resp.status_code != 400:
        return False
    try:
        return resp.json().get("error") == "invalid_grant"
    except Exception:
        return False


async def refresh_access_token(
    refresh_token: str,
    *,
    client_id: str,
    client_secret: str,
) -> str:
    """Exchange a refresh_token for a fresh access_token.

    Raises GcalAuthError on 401 or 400 invalid_grant (token revoked).
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
            },
        )
        if resp.status_code == 401 or _is_invalid_grant(resp):
            raise GcalAuthError(f"refresh_token rejected: {resp.text[:200]}")
        resp.raise_for_status()
        return resp.json()["access_token"]


async def _request_with_retry(
    method: str,
    url: str,
    *,
    access_token: str,
    json: Optional[dict] = None,
) -> httpx.Response:
    """Issue a Calendar API request with exponential backoff on 429/5xx.

    Translates final failures into typed exceptions. 401 raises GcalAuthError
    on the FIRST attempt (no point retrying); 404 raises GcalNotFoundError.
    """
    headers = {"Authorization": f"Bearer {access_token}"}
    last_exc: Optional[Exception] = None

    async with httpx.AsyncClient(timeout=15.0) as client:
        for attempt in range(MAX_ATTEMPTS):
            try:
                resp = await client.request(method, url, headers=headers, json=json)
            except httpx.HTTPError as exc:
                last_exc = exc
                await asyncio.sleep(BASE_BACKOFF_SECONDS * (2 ** attempt))
                continue

            if resp.status_code == 401:
                raise GcalAuthError(f"access_token rejected on {method} {url}")
            if resp.status_code == 404:
                raise GcalNotFoundError(f"resource not found: {method} {url}")
            if resp.status_code in (429,) or 500 <= resp.status_code < 600:
                logger.warning(
                    "gcal %s %s returned %d (attempt %d/%d), backing off",
                    method, url, resp.status_code, attempt + 1, MAX_ATTEMPTS,
                )
                await asyncio.sleep(BASE_BACKOFF_SECONDS * (2 ** attempt))
                last_exc = httpx.HTTPStatusError("retryable", request=resp.request, response=resp)
                continue

            resp.raise_for_status()
            return resp

    # Exhausted retries
    if last_exc and isinstance(last_exc, httpx.HTTPStatusError):
        if last_exc.response.status_code == 429:
            raise GcalRateLimitError("rate limit exhausted") from last_exc
        raise GcalTransientError(f"transient {last_exc.response.status_code} after {MAX_ATTEMPTS} attempts") from last_exc
    raise GcalTransientError(f"network error after {MAX_ATTEMPTS} attempts") from last_exc
