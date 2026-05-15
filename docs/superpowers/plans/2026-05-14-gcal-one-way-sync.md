# Google Calendar Sync (one-way) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync activities created in Kabbalah Space to the user's Google Calendar (one-way: Kabbalah → Google).

**Architecture:** Three new backend modules (`gcal_client`, `gcal_mapper`, `gcal_sync`) with single responsibility — HTTP client, payload mapping, orchestration. Sync runs async via FastAPI `BackgroundTasks` after the API responds. Frontend adds a `/settings` view with one card and a per-activity sync badge. Refresh tokens encrypted with Fernet at rest. Only `provider="google"` users can enable sync in v1.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic + httpx + cryptography (Fernet); React 19 + TypeScript + Vite + Tailwind 4 + framer-motion. Tests: pytest-asyncio with in-memory SQLite + httpx mocking via `respx`.

**Branch:** `feat/gcal-sync` (already created from `main` at the spec commit).

**Spec reference:** `docs/superpowers/specs/2026-05-14-gcal-one-way-sync-design.md`

---

## File Structure

### New files

**Backend:**
- `backend/fernet.py` — Fernet encrypt/decrypt helpers for `google_refresh_token_enc`
- `backend/gcal_client.py` — HTTP wrapper over Google Calendar API + typed exceptions + retry/backoff
- `backend/gcal_mapper.py` — Pure function: `Actividad` → Google `event` payload
- `backend/gcal_sync.py` — Orchestration: lookup user, refresh token, call client, update DB, handle errors
- `backend/alembic/versions/XXXX_add_gcal_sync_columns.py` — Migration for 5 new columns + index
- `backend/tests/test_fernet.py`
- `backend/tests/test_gcal_client.py`
- `backend/tests/test_gcal_mapper.py`
- `backend/tests/test_gcal_sync.py`
- `backend/tests/test_sync_endpoints.py`
- `backend/tests/test_actividad_sync_integration.py`

**Frontend:**
- `frontend/src/sync/types.ts` — `SyncStatus`, `GcalStatus` types
- `frontend/src/sync/api.ts` — fetch wrappers for the 6 endpoints
- `frontend/src/sync/useGcalStatus.ts` — fetch + 2s poll hook
- `frontend/src/sync/useGcalSync.ts` — action hook (connect/disconnect/retry/backfill)
- `frontend/src/sync/index.ts` — barrel
- `frontend/src/settings/GcalSettingsCard.tsx` — the card with 5 states
- `frontend/src/settings/SettingsModule.tsx` — page wrapper
- `frontend/src/settings/index.ts` — barrel
- `frontend/src/calendar/components/ActividadSyncBadge.tsx` — per-activity badge

### Modified files

**Backend:**
- `backend/requirements.txt` — add `cryptography`, `respx` (test dep)
- `backend/.env.example` — add `FERNET_KEY`, `GCAL_REDIRECT_URI` placeholders
- `backend/config.py` — add `fernet_key`, `gcal_redirect_uri` settings + helper `gcal_sync_configured`
- `backend/models.py` — 3 columns on `Usuario` + 2 columns on `Actividad`
- `backend/auth.py` — generalize `create_state_token` and `verify_state_token` to accept a `purpose` parameter
- `backend/main.py` — register 6 sync endpoints + wire `BackgroundTasks` into the 3 actividad mutation endpoints
- `backend/tests/conftest.py` — add `google_user` fixture (seeds a `provider="google"` user with mock refresh_token)

**Frontend:**
- `frontend/src/App.tsx` — add `'settings'` to `ViewKey`, route to `SettingsModule`
- `frontend/src/inicio/components/InicioNav.tsx` — extend `InicioNavTarget` with `'settings'`, add "Configuración" item to user dropdown
- `frontend/src/calendar/CalendarModule.tsx` — render `ActividadSyncBadge` on each activity card (when `gcal_sync_enabled`)

---

## Pre-task: Branch hygiene

The branch `feat/gcal-sync` exists with the design spec committed (`bafa748`). Verify state before starting work:

- [ ] **Step 1: Confirm branch + clean working tree**

```bash
git status
git log --oneline -3
```

Expected: branch is `feat/gcal-sync`, working tree clean, HEAD is the spec commit.

- [ ] **Step 2: Install Fernet dep locally (so tests can run as you go)**

```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\Activate.ps1
pip install cryptography respx
```

(Will be added to `requirements.txt` in Task 1.)

---

## Task 1: Add dependencies + config + env vars

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/.env.example`
- Modify: `backend/config.py`
- Test: (none — config is straight wiring)

- [ ] **Step 1: Add `cryptography` and `respx` to requirements.txt**

Append these two lines to `backend/requirements.txt`:

```
cryptography>=42.0,<46.0
respx>=0.21,<1.0
```

- [ ] **Step 2: Add env vars to `.env.example`**

Append to `backend/.env.example`:

```
# ---------- Google Calendar sync (issue: gcal-sync) ----------
# Fernet key used to encrypt refresh_tokens at rest. Generate with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
FERNET_KEY=

# Redirect URI registered in Google Cloud Console for the CALENDAR scope.
# Different from GOOGLE_REDIRECT_URI which is used for login.
GCAL_REDIRECT_URI=http://localhost:8000/sync/google/callback
```

- [ ] **Step 3: Add settings to `config.py`**

In `backend/config.py`, inside the `Settings` class (before the `@property` methods), add:

```python
    # ---------- Google Calendar sync ----------
    fernet_key: str = ""
    gcal_redirect_uri: str = "http://localhost:8000/sync/google/callback"
```

And add a property below `google_oauth_configured`:

```python
    @property
    def gcal_sync_configured(self) -> bool:
        return bool(self.fernet_key) and self.google_oauth_configured
```

- [ ] **Step 4: Install deps**

```bash
cd backend && pip install -r requirements.txt
```

Expected: no errors. `pip show cryptography` confirms the version.

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/.env.example backend/config.py
git commit -m "chore(gcal): add cryptography dep, FERNET_KEY + GCAL_REDIRECT_URI settings"
```

---

## Task 2: Database columns + Alembic migration

**Files:**
- Modify: `backend/models.py`
- Create: `backend/alembic/versions/XXXX_add_gcal_sync_columns.py` (Alembic generates the filename)
- Test: smoke check via `alembic upgrade head` on a fresh DB

- [ ] **Step 1: Add columns to `Usuario` model**

In `backend/models.py`, inside the `Usuario` class, after `fecha_creacion`, add:

```python
    google_refresh_token_enc = Column(Text, nullable=True)
    google_calendar_id       = Column(String(255), nullable=True)
    gcal_sync_enabled        = Column(Boolean, nullable=False, server_default="false")
```

You will need to add `Boolean` to the SQLAlchemy import at the top of the file:

```python
from sqlalchemy import Column, String, Text, Integer, ForeignKey, DateTime, Index, Boolean
```

- [ ] **Step 2: Add columns to `Actividad` model**

In the same file, inside the `Actividad` class, after `rrule`, add:

```python
    gcal_event_id  = Column(String(255), nullable=True, index=True)
    sync_status    = Column(String(20), nullable=False, server_default="pending")
```

- [ ] **Step 3: Generate Alembic revision**

```bash
cd backend
alembic revision --autogenerate -m "add gcal sync columns"
```

Expected: a new file at `backend/alembic/versions/<hash>_add_gcal_sync_columns.py`. Open it and verify the upgrade adds the 5 columns. The downgrade should drop them.

- [ ] **Step 4: Apply migration to local dev DB**

```bash
alembic upgrade head
```

Expected: `Running upgrade <previous> -> <hash>, add gcal sync columns`.

Smoke check via sqlite cli:
```bash
sqlite3 kabbalah.db "PRAGMA table_info(usuarios);"
sqlite3 kabbalah.db "PRAGMA table_info(actividades);"
```
Expected output includes the new columns.

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/alembic/versions/
git commit -m "feat(gcal): add gcal sync columns to usuarios and actividades"
```

---

## Task 3: Fernet helpers

**Files:**
- Create: `backend/fernet.py`
- Test: `backend/tests/test_fernet.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_fernet.py`:

```python
"""Tests for Fernet encrypt/decrypt helpers."""
import pytest
from cryptography.fernet import Fernet

from fernet import encrypt_token, decrypt_token


@pytest.fixture
def key() -> str:
    return Fernet.generate_key().decode()


def test_roundtrip(key):
    plaintext = "1//abc-refresh-token-from-google"
    encrypted = encrypt_token(plaintext, key)
    assert encrypted != plaintext
    assert decrypt_token(encrypted, key) == plaintext


def test_encrypt_is_nondeterministic(key):
    """Two encryptions of the same plaintext must differ (random IV)."""
    plaintext = "same-token"
    a = encrypt_token(plaintext, key)
    b = encrypt_token(plaintext, key)
    assert a != b
    assert decrypt_token(a, key) == decrypt_token(b, key) == plaintext


def test_decrypt_wrong_key_raises(key):
    encrypted = encrypt_token("secret", key)
    other_key = Fernet.generate_key().decode()
    with pytest.raises(Exception):
        decrypt_token(encrypted, other_key)


def test_decrypt_tampered_raises(key):
    encrypted = encrypt_token("secret", key)
    tampered = encrypted[:-1] + ("A" if encrypted[-1] != "A" else "B")
    with pytest.raises(Exception):
        decrypt_token(tampered, key)
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend
pytest tests/test_fernet.py -v
```

Expected: ImportError — `fernet` module doesn't exist yet.

- [ ] **Step 3: Implement `backend/fernet.py`**

```python
"""Fernet-based helpers for encrypting refresh tokens at rest.

The Fernet key lives in the FERNET_KEY env var and is loaded by config.py.
Each call to `encrypt_token` produces a different ciphertext for the same
plaintext because Fernet includes a random IV. Decryption with a wrong or
tampered key/ciphertext raises cryptography.fernet.InvalidToken.
"""
from __future__ import annotations

from cryptography.fernet import Fernet


def encrypt_token(plaintext: str, key: str) -> str:
    """Encrypt a token string with the given Fernet key. Returns a base64 str."""
    f = Fernet(key.encode() if isinstance(key, str) else key)
    return f.encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_token(ciphertext: str, key: str) -> str:
    """Decrypt a token previously produced by encrypt_token.

    Raises cryptography.fernet.InvalidToken if the key is wrong or the
    ciphertext was tampered with.
    """
    f = Fernet(key.encode() if isinstance(key, str) else key)
    return f.decrypt(ciphertext.encode("ascii")).decode("utf-8")
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pytest tests/test_fernet.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/fernet.py backend/tests/test_fernet.py
git commit -m "feat(gcal): fernet encrypt/decrypt helpers for refresh_token at rest"
```

---

## Task 4: Generalize state token with `purpose` parameter

**Files:**
- Modify: `backend/auth.py:128-147` (functions `create_state_token` and `verify_state_token`)
- Test: extend an existing test file or add a new one — but auth.py has no dedicated test file, so we test via behavior in Task 12 (callback endpoint). For this task: verify by manual inspection + the existing OAuth login tests still pass.

- [ ] **Step 1: Modify `create_state_token` to accept `purpose` + extra claims**

Replace the existing function (around line 128) with:

```python
def create_state_token(
    settings: Settings,
    purpose: str = "oauth_state",
    extra_claims: Optional[dict] = None,
) -> str:
    """Signed JWT used as the OAuth `state` parameter.

    The signature ties the state to OUR backend (any tampering breaks it),
    and the short TTL prevents replay if a redirect URL leaks. The `purpose`
    field distinguishes login flow ("oauth_state") from sync flow
    ("gcal_sync_state") and prevents cross-flow attacks. The `extra_claims`
    let the gcal flow embed the user_id so the callback can identify the
    user without an auth header (the callback is a redirect from Google).
    """
    payload = {
        "nonce": secrets.token_urlsafe(16),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=STATE_TOKEN_TTL_MINUTES),
        "purpose": purpose,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
```

You also need `from typing import Optional` at the top of `auth.py` if not already imported.

- [ ] **Step 2: Modify `verify_state_token` to return the decoded payload (not just a bool)**

Replace with:

```python
def verify_state_token(
    state: str,
    settings: Settings,
    expected_purpose: str = "oauth_state",
) -> Optional[dict]:
    """Returns the decoded payload if valid and purpose matches; else None.

    Callers that only need a yes/no can do `bool(verify_state_token(...))`.
    Callers that need claims (like the gcal callback reading user_id) can
    pull them from the returned dict.
    """
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("purpose") != expected_purpose:
        return None
    return payload
```

Note: existing callers that did `if verify_state_token(...):` still work because `None` is falsy and a dict is truthy.

- [ ] **Step 3: Run the full backend test suite to confirm existing OAuth login still works**

```bash
cd backend
pytest tests/ -v
```

Expected: all existing tests pass. (The existing call sites in `auth.py` for the login flow use the defaults, which preserve the old behavior.)

- [ ] **Step 4: Commit**

```bash
git add backend/auth.py
git commit -m "refactor(auth): generalize state token with purpose parameter"
```

---

## Task 5: gcal_client — typed errors + HTTP backoff helper

**Files:**
- Create: `backend/gcal_client.py`
- Test: `backend/tests/test_gcal_client.py`

- [ ] **Step 1: Write failing test for typed errors**

Create `backend/tests/test_gcal_client.py`:

```python
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
```

- [ ] **Step 2: Run, verify fail**

```bash
pytest tests/test_gcal_client.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement `backend/gcal_client.py` — errors + refresh_access_token + retry helper**

```python
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
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_gcal_client.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/gcal_client.py backend/tests/test_gcal_client.py
git commit -m "feat(gcal): client errors + refresh_access_token + retry helper"
```

---

## Task 6: gcal_client — calendar + event CRUD + revoke

**Files:**
- Modify: `backend/gcal_client.py` (append functions)
- Modify: `backend/tests/test_gcal_client.py` (append tests)

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_gcal_client.py`:

```python
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
```

- [ ] **Step 2: Run, verify fail**

```bash
pytest tests/test_gcal_client.py -v
```

Expected: ImportError for new functions.

- [ ] **Step 3: Implement the new functions**

Append to `backend/gcal_client.py`:

```python
async def create_calendar(*, access_token: str, summary: str, timezone: str = "UTC") -> dict:
    """POST /calendars — create a new secondary calendar. Returns {id, summary}."""
    resp = await _request_with_retry(
        "POST",
        f"{CALENDAR_API_BASE}/calendars",
        access_token=access_token,
        json={"summary": summary, "timeZone": timezone},
    )
    return resp.json()


async def delete_calendar(*, access_token: str, calendar_id: str) -> None:
    """DELETE /calendars/{id} — remove a secondary calendar entirely."""
    await _request_with_retry(
        "DELETE",
        f"{CALENDAR_API_BASE}/calendars/{calendar_id}",
        access_token=access_token,
    )


async def insert_event(*, access_token: str, calendar_id: str, event: dict) -> dict:
    """POST /calendars/{cal}/events — insert an event. Returns the created event dict."""
    resp = await _request_with_retry(
        "POST",
        f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events",
        access_token=access_token,
        json=event,
    )
    return resp.json()


async def update_event(*, access_token: str, calendar_id: str, event_id: str, event: dict) -> dict:
    """PUT /calendars/{cal}/events/{id} — full replace. Returns the updated event."""
    resp = await _request_with_retry(
        "PUT",
        f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events/{event_id}",
        access_token=access_token,
        json=event,
    )
    return resp.json()


async def delete_event(*, access_token: str, calendar_id: str, event_id: str) -> None:
    """DELETE /calendars/{cal}/events/{id} — remove a single event."""
    await _request_with_retry(
        "DELETE",
        f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events/{event_id}",
        access_token=access_token,
    )


async def revoke_refresh_token(refresh_token: str) -> None:
    """POST /revoke — invalidate the refresh_token on Google's side.

    Best-effort: even if this fails, the caller still wipes local state.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            await client.post(GOOGLE_REVOKE_URL, data={"token": refresh_token})
        except httpx.HTTPError as exc:
            logger.warning("revoke_refresh_token failed (non-fatal): %s", exc)
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_gcal_client.py -v
```

Expected: 10 passed (3 from Task 5 + 7 new).

- [ ] **Step 5: Commit**

```bash
git add backend/gcal_client.py backend/tests/test_gcal_client.py
git commit -m "feat(gcal): calendar + event CRUD + refresh_token revoke"
```

---

## Task 7: gcal_mapper — Actividad → event payload

**Files:**
- Create: `backend/gcal_mapper.py`
- Test: `backend/tests/test_gcal_mapper.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_gcal_mapper.py`:

```python
"""Tests for the pure Actividad → Google event payload mapper."""
from datetime import datetime, timezone

from models import Actividad, Sefira
from gcal_mapper import actividad_to_event, SEFIRA_COLOR_ID


def _act(**kwargs) -> Actividad:
    base = dict(
        id="act-1",
        usuario_id="u-1",
        titulo="Meditación matutina",
        descripcion="Foco en el aliento",
        inicio=datetime(2026, 5, 15, 8, 0, tzinfo=timezone.utc),
        fin=datetime(2026, 5, 15, 9, 0, tzinfo=timezone.utc),
        estado="pendiente",
        serie_id=None,
        rrule=None,
        gcal_event_id=None,
        sync_status="pending",
    )
    base.update(kwargs)
    return Actividad(**base)


def _sef(id: str, nombre: str) -> Sefira:
    return Sefira(id=id, nombre=nombre, pilar="centro", descripcion="")


def test_single_activity_basic_fields():
    event = actividad_to_event(_act(), [_sef("jesed", "Jésed")])
    assert event["summary"] == "Meditación matutina"
    assert event["start"]["dateTime"] == "2026-05-15T08:00:00+00:00"
    assert event["end"]["dateTime"] == "2026-05-15T09:00:00+00:00"
    assert "recurrence" not in event


def test_description_includes_sefirot_tagline():
    event = actividad_to_event(_act(), [_sef("jesed", "Jésed"), _sef("tiferet", "Tiféret")])
    assert "Foco en el aliento" in event["description"]
    assert "— Sefirot: Jésed, Tiféret" in event["description"]


def test_description_when_actividad_descripcion_is_none():
    event = actividad_to_event(_act(descripcion=None), [_sef("keter", "Kéter")])
    assert event["description"] == "— Sefirot: Kéter"


def test_series_master_includes_rrule_in_recurrence():
    act = _act(serie_id="series-1", rrule="FREQ=WEEKLY;BYDAY=MO")
    event = actividad_to_event(act, [_sef("jesed", "Jésed")])
    assert event["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO"]


def test_color_id_from_first_sefira():
    event = actividad_to_event(_act(), [_sef("jesed", "Jésed")])
    assert event["colorId"] == SEFIRA_COLOR_ID["jesed"]


def test_color_id_falls_back_when_sefira_unmapped():
    event = actividad_to_event(_act(), [_sef("unknown-sef", "Unknown")])
    # Falls back to a default colorId rather than raising
    assert "colorId" in event
```

- [ ] **Step 2: Run, verify fail**

```bash
pytest tests/test_gcal_mapper.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement `backend/gcal_mapper.py`**

```python
"""Pure mapper from Kabbalah Actividad to Google Calendar event payload.

No I/O, no DB, no FastAPI imports. Just data transformation. The caller
provides the Sefira rows already loaded (gcal_sync does the JOIN).
"""
from __future__ import annotations

from typing import Iterable

from models import Actividad, Sefira


# Google Calendar provides 11 fixed colorIds ("1" through "11").
# Tabla de mapeo sefirá → colorId más cercano visualmente. Documentado
# en el spec, sección 7 (Riesgos). Si una sefirá no está acá, cae al default.
SEFIRA_COLOR_ID: dict[str, str] = {
    "keter":   "8",   # Graphite — gris claro
    "jojma":   "8",   # Graphite — gris medio
    "bina":    "8",   # Graphite — gris oscuro
    "jesed":   "9",   # Blueberry — azul
    "gevura":  "11",  # Tomato — rojo
    "tiferet": "5",   # Banana — amarillo/dorado
    "netzaj":  "10",  # Basil — verde
    "hod":     "6",   # Tangerine — naranja
    "yesod":   "3",   # Grape — violeta
    "maljut":  "7",   # Sage — verde grisáceo (cercano al ámbar profundo)
}

DEFAULT_COLOR_ID = "8"


def actividad_to_event(actividad: Actividad, sefirot: Iterable[Sefira]) -> dict:
    """Build the Google Calendar event payload from an Actividad.

    - Single activity (no serie_id, no rrule): plain event.
    - Series master (rrule set): includes RRULE in event.recurrence.
    - Override of a series instance (handled by the caller, not here):
      caller adds recurringEventId + originalStartTime before sending.
    """
    sefirot_list = list(sefirot)
    sefirot_names = ", ".join(s.nombre for s in sefirot_list) if sefirot_list else "—"

    body = (actividad.descripcion or "").strip()
    if body:
        description = f"{body}\n\n— Sefirot: {sefirot_names}"
    else:
        description = f"— Sefirot: {sefirot_names}"

    first_sefira_id = sefirot_list[0].id if sefirot_list else ""
    color_id = SEFIRA_COLOR_ID.get(first_sefira_id, DEFAULT_COLOR_ID)

    event: dict = {
        "summary": actividad.titulo,
        "description": description,
        "start": {"dateTime": _iso(actividad.inicio)},
        "end":   {"dateTime": _iso(actividad.fin)},
        "colorId": color_id,
    }
    if actividad.rrule:
        event["recurrence"] = [f"RRULE:{actividad.rrule}"]

    return event


def _iso(dt) -> str:
    """ISO 8601 with timezone. Falls back to UTC if naive."""
    if dt.tzinfo is None:
        from datetime import timezone
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_gcal_mapper.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/gcal_mapper.py backend/tests/test_gcal_mapper.py
git commit -m "feat(gcal): pure mapper Actividad → Google event payload"
```

---

## Task 8: gcal_sync — enable / disable user flows

**Files:**
- Create: `backend/gcal_sync.py`
- Test: `backend/tests/test_gcal_sync.py`

- [ ] **Step 1: Add `google_user` fixture to conftest.py**

In `backend/tests/conftest.py`, append at the end:

```python
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
```

- [ ] **Step 2: Write failing test**

Create `backend/tests/test_gcal_sync.py`:

```python
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
    monkeypatch.setattr("config.get_settings", lambda: _settings_with(fkey))

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

    monkeypatch.setattr("config.get_settings", lambda: _settings_with(fkey))

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
```

- [ ] **Step 3: Run, verify fail**

```bash
pytest tests/test_gcal_sync.py -v
```

Expected: ImportError.

- [ ] **Step 4: Implement `backend/gcal_sync.py` (enable + disable only for now)**

```python
"""Orchestration layer: ties the mapper + client + DB together.

Functions here are called from FastAPI endpoints and BackgroundTasks. They
handle: lookup user, refresh access_token, build payload, call client,
update DB row, swallow exceptions in background paths (so a failed sync
never breaks the user's request).
"""
from __future__ import annotations

import logging

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from fernet import decrypt_token, encrypt_token
from gcal_client import (
    GcalAuthError,
    GcalNotFoundError,
    create_calendar,
    delete_calendar,
    refresh_access_token,
    revoke_refresh_token,
)
from models import Actividad, Usuario

logger = logging.getLogger(__name__)

CALENDAR_NAME = "Kabbalah Space"


async def enable_sync_for_user(db: AsyncSession, usuario_id: str, refresh_token: str) -> None:
    """Called from the OAuth callback. Creates the dedicated calendar in
    Google, stores the encrypted refresh_token, marks sync enabled.

    Idempotent: if sync is already enabled, this re-enables with the new
    refresh_token but does NOT create a second calendar (it would be a leak).
    """
    settings = get_settings()
    if not settings.gcal_sync_configured:
        raise RuntimeError("Backend not configured for gcal sync (missing FERNET_KEY)")

    user = (await db.execute(select(Usuario).where(Usuario.id == usuario_id))).scalars().first()
    if not user:
        raise RuntimeError(f"User {usuario_id} not found")

    # Get a fresh access_token first to make sure the refresh_token is valid.
    access_token = await refresh_access_token(
        refresh_token,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
    )

    if user.google_calendar_id:
        # Re-enabling after a previous disconnect that didn't delete the calendar,
        # or first-time enable failed mid-way. Reuse the existing calendar.
        calendar_id = user.google_calendar_id
    else:
        result = await create_calendar(access_token=access_token, summary=CALENDAR_NAME)
        calendar_id = result["id"]

    user.google_refresh_token_enc = encrypt_token(refresh_token, settings.fernet_key)
    user.google_calendar_id = calendar_id
    user.gcal_sync_enabled = True
    await db.commit()
    logger.info("Sync enabled for user %s, calendar=%s", usuario_id, calendar_id)


async def disable_sync_for_user(db: AsyncSession, usuario_id: str) -> None:
    """Called from POST /sync/google/disconnect.

    1. Decrypt refresh_token (if present)
    2. Refresh + delete the calendar from Google (best-effort)
    3. Revoke refresh_token (best-effort)
    4. Wipe all 3 columns on Usuario
    5. Reset sync_status on the user's activities

    Each Google API call is best-effort: if it fails, we still wipe local
    state. This ensures the user can always disconnect cleanly even if
    Google is down or the token is already revoked.
    """
    settings = get_settings()
    user = (await db.execute(select(Usuario).where(Usuario.id == usuario_id))).scalars().first()
    if not user:
        return

    refresh_token = None
    if user.google_refresh_token_enc and settings.fernet_key:
        try:
            refresh_token = decrypt_token(user.google_refresh_token_enc, settings.fernet_key)
        except Exception as exc:
            logger.warning("Could not decrypt refresh_token for user %s: %s", usuario_id, exc)

    if refresh_token and user.google_calendar_id:
        try:
            access_token = await refresh_access_token(
                refresh_token,
                client_id=settings.google_client_id,
                client_secret=settings.google_client_secret,
            )
            try:
                await delete_calendar(access_token=access_token, calendar_id=user.google_calendar_id)
            except GcalNotFoundError:
                pass  # already gone
        except GcalAuthError:
            pass  # token already revoked

    if refresh_token:
        try:
            await revoke_refresh_token(refresh_token)
        except Exception as exc:
            logger.warning("revoke_refresh_token failed (non-fatal): %s", exc)

    user.google_refresh_token_enc = None
    user.google_calendar_id = None
    user.gcal_sync_enabled = False

    # Reset all activities for this user — they need to re-sync on next enable.
    await db.execute(
        update(Actividad)
        .where(Actividad.usuario_id == usuario_id)
        .values(gcal_event_id=None, sync_status="pending")
    )
    await db.commit()
    logger.info("Sync disabled for user %s", usuario_id)
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_gcal_sync.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/gcal_sync.py backend/tests/test_gcal_sync.py backend/tests/conftest.py
git commit -m "feat(gcal): enable/disable sync orchestration with token revoke + calendar cleanup"
```

---

## Task 9: gcal_sync — push / update / delete actividad

**Files:**
- Modify: `backend/gcal_sync.py` (append functions)
- Modify: `backend/tests/test_gcal_sync.py` (append tests)

- [ ] **Step 1: Write failing tests for `push_actividad`**

Append to `backend/tests/test_gcal_sync.py`:

```python
from datetime import datetime, timezone
from gcal_sync import push_actividad, update_actividad, delete_actividad
from models import Actividad, ActividadSefira, Sefira


async def _seed_user_with_sync(db_session, fkey: str, user) -> None:
    """Helper: mark the test user as sync-enabled."""
    from fernet import encrypt_token
    user.gcal_sync_enabled = True
    user.google_calendar_id = "cal_abc"
    user.google_refresh_token_enc = encrypt_token("1//rtok", fkey)
    await db_session.commit()


async def _seed_actividad(db_session, user_id: str, **overrides) -> Actividad:
    base = dict(
        usuario_id=user_id,
        titulo="Meditate",
        descripcion=None,
        inicio=datetime(2026, 5, 15, 8, 0, tzinfo=timezone.utc),
        fin=datetime(2026, 5, 15, 9, 0, tzinfo=timezone.utc),
        estado="pendiente",
        sync_status="pending",
    )
    base.update(overrides)
    a = Actividad(**base)
    db_session.add(a)
    await db_session.commit()
    await db_session.refresh(a)
    # Tag with jesed sefira
    db_session.add(Sefira(id="jesed", nombre="Jésed", pilar="derecha", descripcion=""))
    await db_session.commit()
    db_session.add(ActividadSefira(actividad_id=a.id, sefira_id="jesed"))
    await db_session.commit()
    return a


def _factory(session_maker):
    """Wrap async_sessionmaker into the db_factory shape gcal_sync expects."""
    async def _open():
        async with session_maker() as s:
            yield s
    return _open


@pytest.mark.asyncio
async def test_push_actividad_success_sets_synced_status(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    act = await _seed_actividad(db_session, google_user.id)
    monkeypatch.setattr("config.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        respx.post(f"{CALENDAR_API_BASE}/calendars/cal_abc/events").mock(
            return_value=httpx.Response(200, json={"id": "evt_new"}),
        )

        await push_actividad(session_maker, google_user.id, act.id)

    await db_session.refresh(act)
    assert act.sync_status == "synced"
    assert act.gcal_event_id == "evt_new"


@pytest.mark.asyncio
async def test_push_actividad_500_sets_error_status(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    act = await _seed_actividad(db_session, google_user.id)
    monkeypatch.setattr("config.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        respx.post(f"{CALENDAR_API_BASE}/calendars/cal_abc/events").mock(
            return_value=httpx.Response(500),
        )

        await push_actividad(session_maker, google_user.id, act.id)

    await db_session.refresh(act)
    assert act.sync_status == "error"
    assert act.gcal_event_id is None


@pytest.mark.asyncio
async def test_push_actividad_auth_error_disables_sync(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    act = await _seed_actividad(db_session, google_user.id)
    monkeypatch.setattr("config.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(
            return_value=httpx.Response(400, json={"error": "invalid_grant"}),
        )

        await push_actividad(session_maker, google_user.id, act.id)

    await db_session.refresh(google_user)
    assert google_user.gcal_sync_enabled is False
    assert google_user.google_refresh_token_enc is None


@pytest.mark.asyncio
async def test_update_actividad_calls_update_event(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    act = await _seed_actividad(db_session, google_user.id, gcal_event_id="evt_existing", sync_status="synced")
    monkeypatch.setattr("config.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        respx.put(f"{CALENDAR_API_BASE}/calendars/cal_abc/events/evt_existing").mock(
            return_value=httpx.Response(200, json={"id": "evt_existing"}),
        )

        await update_actividad(session_maker, google_user.id, act.id)

    await db_session.refresh(act)
    assert act.sync_status == "synced"


@pytest.mark.asyncio
async def test_delete_actividad_calls_delete_event(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    monkeypatch.setattr("config.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        route = respx.delete(f"{CALENDAR_API_BASE}/calendars/cal_abc/events/evt_existing").mock(
            return_value=httpx.Response(204),
        )

        await delete_actividad(session_maker, google_user.id, "evt_existing")
        assert route.called
```

- [ ] **Step 2: Run, verify fail**

```bash
pytest tests/test_gcal_sync.py -v
```

Expected: ImportError on `push_actividad`, `update_actividad`, `delete_actividad`.

- [ ] **Step 3: Implement the three functions in `backend/gcal_sync.py`**

Append to `backend/gcal_sync.py`:

```python
from typing import Callable, AsyncContextManager

from sqlalchemy.orm import selectinload

from gcal_client import (
    GcalError,
    delete_event,
    insert_event,
    update_event,
)
from gcal_mapper import actividad_to_event
from models import ActividadSefira, Sefira


DbFactory = Callable[[], AsyncContextManager[AsyncSession]]


async def _get_user_access_token(db: AsyncSession, usuario_id: str) -> tuple[Usuario, str]:
    """Look up the user, decrypt refresh_token, fetch a fresh access_token.

    Raises GcalAuthError if the refresh_token is revoked — caller catches
    and calls disable_sync_for_user.
    """
    settings = get_settings()
    user = (await db.execute(select(Usuario).where(Usuario.id == usuario_id))).scalars().first()
    if not user or not user.gcal_sync_enabled or not user.google_refresh_token_enc:
        raise RuntimeError(f"Sync not enabled for user {usuario_id}")

    refresh_token = decrypt_token(user.google_refresh_token_enc, settings.fernet_key)
    access_token = await refresh_access_token(
        refresh_token,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
    )
    return user, access_token


async def _load_actividad_with_sefirot(
    db: AsyncSession, actividad_id: str, usuario_id: str
) -> tuple[Actividad | None, list[Sefira]]:
    """Load the actividad scoped to the user, plus its sefirot rows."""
    actividad = (await db.execute(
        select(Actividad).where(
            Actividad.id == actividad_id,
            Actividad.usuario_id == usuario_id,
        )
    )).scalars().first()
    if actividad is None:
        return None, []

    sefirot_rows = (await db.execute(
        select(Sefira)
        .join(ActividadSefira, ActividadSefira.sefira_id == Sefira.id)
        .where(ActividadSefira.actividad_id == actividad_id)
        .order_by(Sefira.nombre)
    )).scalars().all()
    return actividad, list(sefirot_rows)


async def push_actividad(db_factory: DbFactory, usuario_id: str, actividad_id: str) -> None:
    """Insert the activity as a new event in Google. Updates DB on result.

    Called as a BackgroundTask. Never raises — failures become sync_status='error'.
    Auth errors disable sync entirely.
    """
    async with db_factory() as db:
        try:
            user, access_token = await _get_user_access_token(db, usuario_id)
        except GcalAuthError:
            await disable_sync_for_user(db, usuario_id)
            return
        except Exception as exc:
            logger.error("push_actividad setup failed for %s/%s: %s", usuario_id, actividad_id, exc)
            return

        actividad, sefirot = await _load_actividad_with_sefirot(db, actividad_id, usuario_id)
        if actividad is None:
            return

        event = actividad_to_event(actividad, sefirot)
        try:
            result = await insert_event(
                access_token=access_token,
                calendar_id=user.google_calendar_id,
                event=event,
            )
            actividad.gcal_event_id = result["id"]
            actividad.sync_status = "synced"
        except GcalAuthError:
            await disable_sync_for_user(db, usuario_id)
            return
        except GcalNotFoundError:
            # Calendar was deleted in Google — recreate and retry once.
            from gcal_client import create_calendar
            new_cal = await create_calendar(access_token=access_token, summary=CALENDAR_NAME)
            user.google_calendar_id = new_cal["id"]
            try:
                result = await insert_event(
                    access_token=access_token,
                    calendar_id=user.google_calendar_id,
                    event=event,
                )
                actividad.gcal_event_id = result["id"]
                actividad.sync_status = "synced"
            except GcalError as exc:
                logger.error("push_actividad retry-after-recreate failed: %s", exc)
                actividad.sync_status = "error"
        except GcalError as exc:
            logger.error("push_actividad failed for %s: %s", actividad_id, exc)
            actividad.sync_status = "error"

        await db.commit()


async def update_actividad(db_factory: DbFactory, usuario_id: str, actividad_id: str) -> None:
    """Update an existing Google event from the current Actividad state.

    If the Actividad has no gcal_event_id yet (series child being edited as
    an override, or a previous push that failed), falls back to insert as
    a new standalone event. This is a v1 simplification: a true Google
    "recurring instance override" would use recurringEventId+originalStartTime
    so the override stays linked to the series master in Google. For v1 we
    accept that overrides create a separate Google event (slightly noisier
    in the user's calendar but functionally correct). Refinement is tracked
    as Future work in the spec §8.
    """
    async with db_factory() as db:
        try:
            user, access_token = await _get_user_access_token(db, usuario_id)
        except GcalAuthError:
            await disable_sync_for_user(db, usuario_id)
            return
        except Exception as exc:
            logger.error("update_actividad setup failed: %s", exc)
            return

        actividad, sefirot = await _load_actividad_with_sefirot(db, actividad_id, usuario_id)
        if actividad is None:
            return

        if not actividad.gcal_event_id:
            # No previous push — treat as fresh insert
            event = actividad_to_event(actividad, sefirot)
            try:
                result = await insert_event(
                    access_token=access_token,
                    calendar_id=user.google_calendar_id,
                    event=event,
                )
                actividad.gcal_event_id = result["id"]
                actividad.sync_status = "synced"
            except GcalError as exc:
                logger.error("update_actividad insert fallback failed: %s", exc)
                actividad.sync_status = "error"
            await db.commit()
            return

        event = actividad_to_event(actividad, sefirot)
        try:
            await update_event(
                access_token=access_token,
                calendar_id=user.google_calendar_id,
                event_id=actividad.gcal_event_id,
                event=event,
            )
            actividad.sync_status = "synced"
        except GcalAuthError:
            await disable_sync_for_user(db, usuario_id)
            return
        except GcalNotFoundError:
            # Event was deleted in Google — re-insert.
            try:
                result = await insert_event(
                    access_token=access_token,
                    calendar_id=user.google_calendar_id,
                    event=event,
                )
                actividad.gcal_event_id = result["id"]
                actividad.sync_status = "synced"
            except GcalError as exc:
                logger.error("update_actividad re-insert failed: %s", exc)
                actividad.sync_status = "error"
        except GcalError as exc:
            logger.error("update_actividad failed: %s", exc)
            actividad.sync_status = "error"

        await db.commit()


async def delete_actividad(db_factory: DbFactory, usuario_id: str, gcal_event_id: str) -> None:
    """Delete an event from Google. Called with the gcal_event_id read BEFORE
    the DB row is deleted (because by the time this task runs, the row is gone).
    """
    async with db_factory() as db:
        try:
            user, access_token = await _get_user_access_token(db, usuario_id)
        except GcalAuthError:
            await disable_sync_for_user(db, usuario_id)
            return
        except Exception as exc:
            logger.error("delete_actividad setup failed: %s", exc)
            return

        try:
            await delete_event(
                access_token=access_token,
                calendar_id=user.google_calendar_id,
                event_id=gcal_event_id,
            )
        except GcalAuthError:
            await disable_sync_for_user(db, usuario_id)
        except GcalNotFoundError:
            pass  # already gone, no-op
        except GcalError as exc:
            logger.error("delete_actividad failed: %s", exc)
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_gcal_sync.py -v
```

Expected: 7 passed (2 from Task 8 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add backend/gcal_sync.py backend/tests/test_gcal_sync.py
git commit -m "feat(gcal): push/update/delete actividad orchestration with error handling"
```

---

## Task 10: gcal_sync — backfill (idempotent)

**Files:**
- Modify: `backend/gcal_sync.py` (append `backfill_user`)
- Modify: `backend/tests/test_gcal_sync.py` (append test)

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_gcal_sync.py`:

```python
from gcal_sync import backfill_user


@pytest.mark.asyncio
async def test_backfill_iterates_only_pending_and_skips_children(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    monkeypatch.setattr("config.get_settings", lambda: _settings_with(fkey))

    # Three activities: single pending, series master pending, series child (should skip)
    a1 = await _seed_actividad(db_session, google_user.id, titulo="Single")
    a2 = await _seed_actividad(
        db_session, google_user.id, titulo="Master",
        serie_id="series-x", rrule="FREQ=WEEKLY",
    )
    a3 = await _seed_actividad(
        db_session, google_user.id, titulo="Child",
        serie_id="series-x", rrule=None,
    )

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        insert_route = respx.post(f"{CALENDAR_API_BASE}/calendars/cal_abc/events").mock(
            side_effect=[
                httpx.Response(200, json={"id": "evt_1"}),
                httpx.Response(200, json={"id": "evt_2"}),
            ],
        )

        await backfill_user(session_maker, google_user.id)
        assert insert_route.call_count == 2  # only single + master, not child

    for a in (a1, a2, a3):
        await db_session.refresh(a)
    assert a1.sync_status == "synced"
    assert a2.sync_status == "synced"
    assert a3.sync_status == "skipped"
```

- [ ] **Step 2: Run, verify fail**

```bash
pytest tests/test_gcal_sync.py::test_backfill_iterates_only_pending_and_skips_children -v
```

Expected: ImportError.

- [ ] **Step 3: Implement `backfill_user`**

Append to `backend/gcal_sync.py`:

```python
import asyncio


BACKFILL_THROTTLE_PER_SECOND = 10
BACKFILL_THROTTLE_DELAY = 1.0 / BACKFILL_THROTTLE_PER_SECOND


async def backfill_user(db_factory: DbFactory, usuario_id: str) -> None:
    """Push all not-yet-synced activities of the user to Google.

    Idempotent: filter is `sync_status='pending' AND (rrule IS NOT NULL OR serie_id IS NULL)`.
    Materialized children of a series are marked 'skipped' immediately (their
    master is what gets pushed; Google handles the repetitions).

    Throttled to BACKFILL_THROTTLE_PER_SECOND req/s to stay under Google's
    per-user-per-minute quota. If interrupted, calling again continues from
    where it stopped because synced rows are filtered out.
    """
    async with db_factory() as db:
        # Mark all series children as 'skipped' upfront — they don't need pushes.
        await db.execute(
            update(Actividad)
            .where(
                Actividad.usuario_id == usuario_id,
                Actividad.sync_status == "pending",
                Actividad.serie_id.is_not(None),
                Actividad.rrule.is_(None),
            )
            .values(sync_status="skipped")
        )
        await db.commit()

        rows = (await db.execute(
            select(Actividad.id).where(
                Actividad.usuario_id == usuario_id,
                Actividad.sync_status == "pending",
            ).order_by(Actividad.inicio)
        )).scalars().all()

    for actividad_id in rows:
        await push_actividad(db_factory, usuario_id, actividad_id)
        await asyncio.sleep(BACKFILL_THROTTLE_DELAY)
    logger.info("Backfill complete for user %s: %d activities", usuario_id, len(rows))
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_gcal_sync.py -v
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/gcal_sync.py backend/tests/test_gcal_sync.py
git commit -m "feat(gcal): idempotent backfill — skip series children, throttle 10 req/s"
```

---

## Task 11: OAuth flow endpoints — authorize + callback + disconnect

**Files:**
- Modify: `backend/main.py` (add 3 endpoints near the existing `/auth/google/*` ones)
- Test: `backend/tests/test_sync_endpoints.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_sync_endpoints.py`:

```python
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
    """Seed a Google user and produce auth headers."""
    import jwt
    from config import get_settings

    settings = get_settings()
    # Monkeypatch settings with our fernet_key + google creds for sync
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
    monkeypatch.setattr("config.get_settings", lambda: S())

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
    assert r.status_code == 200
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
    settings = get_settings()
    import jwt
    u = Usuario(nombre="Bob", email="bob@example.com", provider="email", password_hash="hash")
    db_session.add(u); await db_session.commit(); await db_session.refresh(u)
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
```

- [ ] **Step 2: Run, verify fail**

```bash
pytest tests/test_sync_endpoints.py -v
```

Expected: 404 / missing endpoint.

- [ ] **Step 3: Implement the 3 endpoints in `main.py`**

First, add these imports near the top of `main.py` (with the other backend imports):

```python
from urllib.parse import urlencode

import gcal_sync
from auth import GOOGLE_AUTH_URL
```

Then add the new endpoints. Place them near the existing `/auth/google/*` endpoints (search for `google/authorize` in main.py to find the spot):

```python
GCAL_SCOPE = "https://www.googleapis.com/auth/calendar"


def _build_gcal_authorize_url(settings, state: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.gcal_redirect_uri,
        "response_type": "code",
        "scope": GCAL_SCOPE,
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


@app.get("/sync/google/authorize")
async def gcal_authorize(
    user: Usuario = Depends(get_current_user),
):
    settings = get_settings()
    if not settings.gcal_sync_configured:
        raise HTTPException(503, "Google Calendar sync is not configured on this server")
    if user.provider != "google":
        raise HTTPException(403, "Solo usuarios autenticados con Google pueden activar sync")

    from auth import create_state_token
    # Embed user_id in the state so the callback can identify the user
    # (the callback is a redirect from Google and has no auth header).
    state = create_state_token(
        settings,
        purpose="gcal_sync_state",
        extra_claims={"user_id": user.id},
    )
    return {"url": _build_gcal_authorize_url(settings, state)}


@app.get("/sync/google/callback")
async def gcal_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """OAuth callback from Google. This route has NO auth header because it's
    a redirect from Google's domain — we identify the user via the user_id
    claim baked into the state JWT (which we signed in /authorize).
    """
    settings = get_settings()
    if not settings.gcal_sync_configured:
        raise HTTPException(503, "Google Calendar sync is not configured")

    from auth import verify_state_token
    if error:
        return RedirectResponse(f"{settings.frontend_url}/?sync=denied", status_code=303)
    if not code or not state:
        raise HTTPException(400, "Missing code or state")

    payload = verify_state_token(state, settings, "gcal_sync_state")
    if not payload or not payload.get("user_id"):
        raise HTTPException(400, "Invalid OAuth state")

    user_id = payload["user_id"]
    user = (await db.execute(select(Usuario).where(Usuario.id == user_id))).scalars().first()
    if not user or user.provider != "google":
        raise HTTPException(403)

    # Exchange code for tokens — must include refresh_token because we used access_type=offline.
    async with httpx.AsyncClient(timeout=10.0) as http:
        resp = await http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.gcal_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(400, f"Token exchange failed: {resp.text[:200]}")
        tokens = resp.json()

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        # Google didn't return one — usually because the user didn't see the consent screen
        # (prompt=consent should force it; if it still happens, ask user to revoke and retry).
        raise HTTPException(
            400,
            "Google did not return a refresh_token. Revoke access at "
            "myaccount.google.com/permissions and try again.",
        )

    await gcal_sync.enable_sync_for_user(db, user_id, refresh_token)

    # Kick off backfill in the background — the route returns before it completes.
    from database import get_session_factory
    import asyncio
    asyncio.create_task(gcal_sync.backfill_user(get_session_factory(), user_id))

    return RedirectResponse(f"{settings.frontend_url}/?sync=connected", status_code=303)


@app.post("/sync/google/disconnect")
async def gcal_disconnect(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    if not settings.gcal_sync_configured:
        raise HTTPException(503)
    await gcal_sync.disable_sync_for_user(db, user.id)
    return {"ok": True}
```

You also need to add a `get_session_factory()` helper in `database.py` that returns an async sessionmaker callable. Open `backend/database.py`, find where `async_sessionmaker` is created (probably near `engine`), and export:

```python
def get_session_factory():
    """Returns a callable that opens a new AsyncSession context-managed.
    Used by BackgroundTasks / asyncio.create_task that run outside requests.
    """
    return async_session  # whichever name is used in database.py
```

(If `database.py` uses a different name like `SessionLocal`, return that.) Open the file and adapt.

Also add `from fastapi.responses import RedirectResponse` near the top of `main.py` if not already imported.

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_sync_endpoints.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/database.py backend/tests/test_sync_endpoints.py
git commit -m "feat(gcal): /sync/google/authorize|callback|disconnect endpoints"
```

---

## Task 12: Status + backfill + retry-sync endpoints

**Files:**
- Modify: `backend/main.py` (3 more endpoints)
- Modify: `backend/tests/test_sync_endpoints.py` (append tests)

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_sync_endpoints.py`:

```python
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
```

- [ ] **Step 2: Run, verify fail**

```bash
pytest tests/test_sync_endpoints.py -v
```

Expected: 404 on `/sync/status` and `/actividades/{id}/retry-sync`.

- [ ] **Step 3: Implement the endpoints in `main.py`**

Append near the other sync endpoints:

```python
class SyncStatusOut(BaseModel):
    enabled: bool
    calendar_name: Optional[str] = None
    last_sync_at: Optional[datetime] = None
    pending_count: int
    error_count: int


@app.get("/sync/status", response_model=SyncStatusOut)
async def sync_status(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pending = (await db.execute(
        select(func.count(Actividad.id)).where(
            Actividad.usuario_id == user.id,
            Actividad.sync_status == "pending",
        )
    )).scalar() or 0
    errors = (await db.execute(
        select(func.count(Actividad.id)).where(
            Actividad.usuario_id == user.id,
            Actividad.sync_status == "error",
        )
    )).scalar() or 0
    last = (await db.execute(
        select(Actividad.fecha_actualizacion).where(
            Actividad.usuario_id == user.id,
            Actividad.sync_status == "synced",
        ).order_by(Actividad.fecha_actualizacion.desc()).limit(1)
    )).scalar()

    return SyncStatusOut(
        enabled=user.gcal_sync_enabled,
        calendar_name="Kabbalah Space" if user.gcal_sync_enabled else None,
        last_sync_at=last,
        pending_count=pending,
        error_count=errors,
    )


@app.post("/sync/backfill")
async def sync_backfill(
    background_tasks: BackgroundTasks,
    user: Usuario = Depends(get_current_user),
):
    if not user.gcal_sync_enabled:
        raise HTTPException(400, "Sync not enabled")
    from database import get_session_factory
    background_tasks.add_task(gcal_sync.backfill_user, get_session_factory(), user.id)
    return {"ok": True, "scheduled": True}


@app.post("/actividades/{actividad_id}/retry-sync")
async def retry_actividad_sync(
    actividad_id: str,
    background_tasks: BackgroundTasks,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    actividad = (await db.execute(
        select(Actividad).where(Actividad.id == actividad_id, Actividad.usuario_id == user.id)
    )).scalars().first()
    if not actividad:
        raise HTTPException(404)
    if not user.gcal_sync_enabled:
        raise HTTPException(400, "Sync not enabled")

    actividad.sync_status = "pending"
    await db.commit()

    from database import get_session_factory
    if actividad.gcal_event_id:
        background_tasks.add_task(gcal_sync.update_actividad, get_session_factory(), user.id, actividad_id)
    else:
        background_tasks.add_task(gcal_sync.push_actividad, get_session_factory(), user.id, actividad_id)
    return {"ok": True}
```

Add to imports if not present:

```python
from fastapi import BackgroundTasks
from sqlalchemy import func
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_sync_endpoints.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_sync_endpoints.py
git commit -m "feat(gcal): /sync/status + /sync/backfill + /actividades/{id}/retry-sync"
```

---

## Task 13: Integrate sync into POST/PUT/DELETE /actividades

**Files:**
- Modify: `backend/main.py:797-941` (the three actividad CRUD endpoints)
- Test: `backend/tests/test_actividad_sync_integration.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_actividad_sync_integration.py`:

```python
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
    import jwt
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
    monkeypatch.setattr("config.get_settings", lambda: S())

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
    # Pre-seed an actividad with a gcal_event_id
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
```

- [ ] **Step 2: Run, verify fail**

```bash
pytest tests/test_actividad_sync_integration.py -v
```

Expected: 3 fails (no sync hooks yet), 1 pass (the disabled one — Google isn't called because no hook exists).

- [ ] **Step 3: Wire BackgroundTasks into the 3 endpoints**

In `main.py`, modify `POST /actividades` (around line 797). Add `background_tasks: BackgroundTasks` parameter and at the end before each `return`:

```python
@app.post("/actividades", response_model=list[ActividadOut])
async def create_actividad(
    payload: ActividadCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if payload.fin <= payload.inicio:
        raise HTTPException(status_code=422, detail="La fecha de fin debe ser mayor a la fecha de inicio")
    await validate_sefirot_ids(db, payload.sefirot_ids)

    if payload.rrule:
        try:
            rrulestr(payload.rrule, dtstart=normalize_datetime(payload.inicio))
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=f"RRULE inválido: {exc}")

        serie_id = str(uuid.uuid4())
        instancias = await materialize_series(
            db, payload, serie_id, payload.sefirot_ids, usuario_id=user.id,
        )
        if not instancias:
            raise HTTPException(status_code=422, detail="El RRULE no genera ninguna ocurrencia")
        await db.commit()

        # Schedule sync for the series master + mark children skipped.
        if user.gcal_sync_enabled:
            from database import get_session_factory
            for actividad in instancias:
                if actividad.rrule:  # this is the master
                    background_tasks.add_task(
                        gcal_sync.push_actividad, get_session_factory(), user.id, actividad.id,
                    )
                else:
                    actividad.sync_status = "skipped"
            await db.commit()

        return [await serialize_actividad(db, a) for a in instancias]

    actividad = Actividad(
        titulo=payload.titulo.strip(),
        descripcion=(payload.descripcion or "").strip() or None,
        inicio=normalize_datetime(payload.inicio),
        fin=normalize_datetime(payload.fin),
        estado="pendiente",
        usuario_id=user.id,
    )
    db.add(actividad)
    await db.flush()

    for sefira_id in payload.sefirot_ids:
        db.add(ActividadSefira(actividad_id=actividad.id, sefira_id=sefira_id))

    await db.commit()
    await db.refresh(actividad)

    if user.gcal_sync_enabled:
        from database import get_session_factory
        background_tasks.add_task(
            gcal_sync.push_actividad, get_session_factory(), user.id, actividad.id,
        )

    return [await serialize_actividad(db, actividad)]
```

Modify `PUT /actividades/{id}` (around line 841). Add `background_tasks: BackgroundTasks` parameter and at the end before each `return`:

```python
    # ... existing logic to update or rematerialize ...

    if user.gcal_sync_enabled:
        from database import get_session_factory
        if scope == "one" or actividad.serie_id is None:
            # Single update — if it's a series child, this is the override case.
            # gcal_sync.update_actividad handles both: single insert/update and
            # override of a child whose master is already in Google.
            background_tasks.add_task(
                gcal_sync.update_actividad, get_session_factory(), user.id, actividad_id,
            )
        else:
            # scope == "series" — the master was destroyed and re-materialized.
            # Delete the old Google event (if any) and push the new master.
            old_event_id = actividad.gcal_event_id  # captured before delete in DB
            if old_event_id:
                background_tasks.add_task(
                    gcal_sync.delete_actividad, get_session_factory(), user.id, old_event_id,
                )
            # Find the new master (the instancia with rrule set)
            new_master = next((a for a in instancias if a.rrule), None)
            if new_master:
                background_tasks.add_task(
                    gcal_sync.push_actividad, get_session_factory(), user.id, new_master.id,
                )
            for a in instancias:
                if not a.rrule:
                    a.sync_status = "skipped"
            await db.commit()

    return ...  # whatever the existing return is
```

For `DELETE /actividades/{id}` (around line 910), capture `gcal_event_id` BEFORE the DB delete:

```python
@app.delete("/actividades/{actividad_id}")
async def delete_actividad(
    actividad_id: str,
    background_tasks: BackgroundTasks,
    scope: str = Query("one", pattern="^(one|series)$"),
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    actividad = (await db.execute(
        select(Actividad).where(
            Actividad.id == actividad_id,
            Actividad.usuario_id == user.id,
        )
    )).scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    # Capture gcal_event_ids BEFORE deletion.
    event_ids_to_delete: list[str] = []
    if scope == "series" and actividad.serie_id is not None:
        siblings = (await db.execute(
            select(Actividad).where(
                Actividad.serie_id == actividad.serie_id,
                Actividad.usuario_id == user.id,
            )
        )).scalars().all()
        for s in siblings:
            if s.gcal_event_id and s.rrule:  # only the master
                event_ids_to_delete.append(s.gcal_event_id)
        sibling_ids = [s.id for s in siblings]

        await db.execute(delete(ActividadSefira).where(ActividadSefira.actividad_id.in_(sibling_ids)))
        await db.execute(delete(Actividad).where(
            and_(Actividad.serie_id == actividad.serie_id, Actividad.usuario_id == user.id)
        ))
    else:
        if actividad.gcal_event_id:
            event_ids_to_delete.append(actividad.gcal_event_id)
        await db.delete(actividad)

    await db.commit()

    if user.gcal_sync_enabled:
        from database import get_session_factory
        for eid in event_ids_to_delete:
            background_tasks.add_task(
                gcal_sync.delete_actividad, get_session_factory(), user.id, eid,
            )

    return {"message": "Actividad eliminada"}
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_actividad_sync_integration.py -v
pytest tests/  # full suite to confirm no regressions
```

Expected: integration tests pass, no regressions in privacy tests.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_actividad_sync_integration.py
git commit -m "feat(gcal): wire BackgroundTasks into actividad POST/PUT/DELETE"
```

---

## Task 14: Frontend — sync types + api + hooks

**Files:**
- Create: `frontend/src/sync/types.ts`
- Create: `frontend/src/sync/api.ts`
- Create: `frontend/src/sync/useGcalStatus.ts`
- Create: `frontend/src/sync/useGcalSync.ts`
- Create: `frontend/src/sync/index.ts`

- [ ] **Step 1: Create `types.ts`**

```typescript
export type SyncStatus = 'pending' | 'synced' | 'error' | 'skipped';

export type GcalStatus = {
  enabled: boolean;
  calendar_name: string | null;
  last_sync_at: string | null;
  pending_count: number;
  error_count: number;
};
```

- [ ] **Step 2: Create `api.ts`**

```typescript
import type { GcalStatus } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('kabbalah-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchAuthorizeUrl(): Promise<string> {
  const r = await fetch(`${API_BASE}/sync/google/authorize`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`authorize failed: ${r.status}`);
  const body = await r.json();
  return body.url;
}

export async function fetchSyncStatus(): Promise<GcalStatus> {
  const r = await fetch(`${API_BASE}/sync/status`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`status failed: ${r.status}`);
  return r.json();
}

export async function disconnectSync(): Promise<void> {
  const r = await fetch(`${API_BASE}/sync/google/disconnect`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`disconnect failed: ${r.status}`);
}

export async function triggerBackfill(): Promise<void> {
  const r = await fetch(`${API_BASE}/sync/backfill`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`backfill failed: ${r.status}`);
}

export async function retryActividadSync(id: string): Promise<void> {
  const r = await fetch(`${API_BASE}/actividades/${id}/retry-sync`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`retry failed: ${r.status}`);
}
```

- [ ] **Step 3: Create `useGcalStatus.ts`**

```typescript
import { useEffect, useState } from 'react';
import { fetchSyncStatus } from './api';
import type { GcalStatus } from './types';

const POLL_INTERVAL_MS = 2000;

export function useGcalStatus(enabled: boolean = true): {
  status: GcalStatus | null;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [status, setStatus] = useState<GcalStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    try {
      const s = await fetchSyncStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refetch();
    };
    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  return { status, loading, refetch };
}
```

- [ ] **Step 4: Create `useGcalSync.ts`**

```typescript
import { useCallback, useState } from 'react';
import {
  disconnectSync,
  fetchAuthorizeUrl,
  retryActividadSync,
  triggerBackfill,
} from './api';

export function useGcalSync() {
  const [working, setWorking] = useState(false);

  const connect = useCallback(async () => {
    setWorking(true);
    try {
      const url = await fetchAuthorizeUrl();
      window.location.href = url;
    } finally {
      setWorking(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setWorking(true);
    try {
      await disconnectSync();
    } finally {
      setWorking(false);
    }
  }, []);

  const backfill = useCallback(async () => {
    setWorking(true);
    try {
      await triggerBackfill();
    } finally {
      setWorking(false);
    }
  }, []);

  const retry = useCallback(async (id: string) => {
    await retryActividadSync(id);
  }, []);

  return { connect, disconnect, backfill, retry, working };
}
```

- [ ] **Step 5: Create `index.ts` barrel**

```typescript
export type { SyncStatus, GcalStatus } from './types';
export { useGcalStatus } from './useGcalStatus';
export { useGcalSync } from './useGcalSync';
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/sync/
git commit -m "feat(gcal-frontend): types + api + status/sync hooks"
```

---

## Task 15: Frontend — GcalSettingsCard with 5 states

**Files:**
- Create: `frontend/src/settings/GcalSettingsCard.tsx`

- [ ] **Step 1: Read `useAuth` types to understand provider check**

Run `Grep` for `provider` in `frontend/src/auth/types.ts` to see the User shape. It has `provider: 'email' | 'google'`.

- [ ] **Step 2: Create the component**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../auth';
import { useGcalStatus, useGcalSync } from '../sync';

const ease = [0.16, 1, 0.3, 1] as const;

export default function GcalSettingsCard() {
  const auth = useAuth();
  const { status, refetch } = useGcalStatus(auth.status === 'authenticated');
  const { connect, disconnect, backfill, working } = useGcalSync();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const isGoogleUser = auth.status === 'authenticated' && auth.user?.provider === 'google';
  const isAnonymous = auth.status === 'anonymous';
  const enabled = status?.enabled === true;
  const errorCount = status?.error_count ?? 0;
  const pendingCount = status?.pending_count ?? 0;
  const backfillInProgress = enabled && pendingCount > 0;

  return (
    <section className="ks-module-card p-7">
      <p className="ks-eyebrow text-gold mb-3">Google Calendar</p>
      <h2 className="ks-serif text-2xl text-ink-glow font-light mb-2">
        Sincronizar tus actividades
      </h2>
      <p className="ks-body text-sm mb-6">
        Las actividades que crees aparecerán en un calendario dedicado llamado
        "Kabbalah Space" en tu Google Calendar.
      </p>

      {/* State 1: anonymous or email user */}
      {(isAnonymous || (!isGoogleUser && auth.status === 'authenticated')) && (
        <div className="opacity-50">
          <p className="text-sm text-stone-400 mb-4">
            {isAnonymous
              ? 'Necesitás iniciar sesión con Google para activar sync.'
              : 'Tu cuenta es de email/contraseña. Vinculá una cuenta Google para activar sync.'}
          </p>
          <button type="button" disabled className="ks-btn-primary opacity-40 cursor-not-allowed">
            Vinculá tu cuenta de Google
          </button>
        </div>
      )}

      {/* State 2: Google user, sync disabled */}
      {isGoogleUser && !enabled && (
        <button
          type="button"
          onClick={connect}
          disabled={working}
          className="ks-btn-primary"
        >
          {working ? 'Conectando...' : 'Activar sync con Google Calendar'}
        </button>
      )}

      {/* State 3: backfill in progress */}
      {isGoogleUser && enabled && backfillInProgress && (
        <div>
          <p className="text-sm text-ink mb-3">
            Sincronizando {pendingCount} {pendingCount === 1 ? 'actividad' : 'actividades'}…
          </p>
          <div className="w-full h-1 bg-stone-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gold"
              initial={{ width: '15%' }}
              animate={{ width: '85%' }}
              transition={{ duration: 5, ease, repeat: Infinity, repeatType: 'reverse' }}
            />
          </div>
          {status?.last_sync_at && (
            <p className="ks-eyebrow text-stone-500 mt-3">
              Última actividad subida: {formatRelative(status.last_sync_at)}
            </p>
          )}
        </div>
      )}

      {/* State 4: sync active, idle */}
      {isGoogleUser && enabled && !backfillInProgress && (
        <div>
          <p className="ks-body text-sm text-gold mb-2">
            ✓ Sincronizado · {status?.last_sync_at
              ? `última actividad subida ${formatRelative(status.last_sync_at)}`
              : 'sin actividad reciente'}
          </p>
          <p className="ks-body text-sm mb-5">
            Calendario: <span className="text-ink-glow">"{status?.calendar_name ?? 'Kabbalah Space'}"</span> en tu Google Calendar
          </p>

          {errorCount > 0 && (
            <div className="mb-5 p-3 rounded-md border border-amber-500/40 bg-amber-500/10">
              <p className="text-sm text-amber-200">
                {errorCount} {errorCount === 1 ? 'actividad no sincronizó' : 'actividades no sincronizaron'}.
                <button
                  type="button"
                  onClick={() => { backfill().then(refetch); }}
                  className="underline ml-2 text-amber-100"
                >
                  Reintentar
                </button>
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => { backfill().then(refetch); }} className="ks-btn-ghost">
              Re-sincronizar todo
            </button>
            <button type="button" onClick={() => setConfirmingDisconnect(true)} className="ks-btn-ghost">
              Desconectar Google
            </button>
          </div>
        </div>
      )}

      {/* State 5: disconnect confirmation modal */}
      <AnimatePresence>
        {confirmingDisconnect && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-bg-deep/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setConfirmingDisconnect(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.22, ease }}
              onClick={(e) => e.stopPropagation()}
              className="ks-module-card p-7 max-w-md w-full"
            >
              <h3 className="ks-serif text-xl text-ink-glow mb-3">¿Desconectar Google Calendar?</h3>
              <p className="ks-body text-sm mb-6">
                Borraremos el calendario "Kabbalah Space" de tu Google. Tus actividades
                en Kabbalah Space se conservan.
              </p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setConfirmingDisconnect(false)} className="ks-btn-ghost">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setConfirmingDisconnect(false);
                    await disconnect();
                    await refetch();
                  }}
                  className="ks-btn-primary"
                >
                  Sí, desconectar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'hace un instante';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
```

- [ ] **Step 3: Compile check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/settings/GcalSettingsCard.tsx
git commit -m "feat(gcal-frontend): GcalSettingsCard with 5 states"
```

---

## Task 16: Frontend — SettingsModule + route + nav dropdown item

**Files:**
- Create: `frontend/src/settings/SettingsModule.tsx`
- Create: `frontend/src/settings/index.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/inicio/components/InicioNav.tsx`

- [ ] **Step 1: Create `SettingsModule.tsx`**

```tsx
import GcalSettingsCard from './GcalSettingsCard';

export default function SettingsModule() {
  return (
    <div className="max-w-2xl w-full px-4 py-6">
      <h1 className="ks-serif text-4xl text-ink-glow font-light mb-2">Configuración</h1>
      <p className="ks-body text-sm mb-10">Integraciones con servicios externos.</p>
      <GcalSettingsCard />
    </div>
  );
}
```

- [ ] **Step 2: Create barrel `index.ts`**

```typescript
export { default } from './SettingsModule';
```

- [ ] **Step 3: Modify `App.tsx`**

Add `'settings'` to `ViewKey` (around line 23):

```typescript
type ViewKey = 'inicio' | 'espejo' | 'admin' | 'calendario' | 'evolucion' | 'settings';
```

Add to `VIEW_TITLES`:

```typescript
const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  inicio:     { title: 'Kabbalah Space',          subtitle: '...' },
  espejo:     { title: 'Mi Árbol de la Vida',    subtitle: '...' },
  evolucion:  { title: 'Mi Evolución',            subtitle: '...' },
  calendario: { title: 'Calendario Cabalístico', subtitle: '...' },
  admin:      { title: 'Panel de Administrador', subtitle: '...' },
  settings:   { title: 'Configuración',          subtitle: 'Integraciones con servicios externos.' },
};
```

Import the module near the top:

```typescript
import SettingsModule from './settings';
```

Add the conditional render in the `<section>` switch:

```tsx
            {activeView === 'settings' && <SettingsModule />}
```

- [ ] **Step 4: Modify `InicioNav.tsx` to add "Configuración" item**

Update the type:

```typescript
export type InicioNavTarget = 'inicio' | 'espejo' | 'calendario' | 'evolucion' | 'settings';
```

In the user dropdown menu (the `{open && ...}` AnimatePresence block in InicioNav), add a "Configuración" menuitem before the "Cerrar sesión" divider. Find the existing logout button and add above it:

```tsx
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('settings');
                      }}
                      className="w-full px-4 py-2.5 flex items-center gap-2 text-stone-300 hover:text-amber-200 hover:bg-stone-900/80 text-xs tracking-wide transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">settings</span>
                      Configuración
                    </button>
                    <div className="h-px bg-stone-800/70" />
```

- [ ] **Step 5: Compile check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/settings/ frontend/src/App.tsx frontend/src/inicio/components/InicioNav.tsx
git commit -m "feat(gcal-frontend): /settings view + nav dropdown item"
```

---

## Task 17: Frontend — ActividadSyncBadge + wire into calendar

**Files:**
- Create: `frontend/src/calendar/components/ActividadSyncBadge.tsx`
- Modify: `frontend/src/calendar/CalendarModule.tsx` (or wherever activity cards render)

- [ ] **Step 1: Find where activity cards render**

```bash
grep -rn "actividad" frontend/src/calendar/components/CalendarEvent.tsx | head -5
```

`CalendarEvent.tsx` is the component that renders one activity in a calendar slot. The badge goes there.

- [ ] **Step 2: Create the badge component**

```tsx
import { useState } from 'react';
import type { SyncStatus } from '../../sync/types';
import { useGcalSync } from '../../sync';

type Props = {
  actividadId: string;
  status: SyncStatus;
};

export default function ActividadSyncBadge({ actividadId, status }: Props) {
  const { retry } = useGcalSync();
  const [retrying, setRetrying] = useState(false);

  if (status === 'skipped') return null;

  const onRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(true);
    try {
      await retry(actividadId);
    } finally {
      setRetrying(false);
    }
  };

  if (status === 'synced') {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gold/15 text-gold text-[10px]"
        title="Sincronizado con Google Calendar"
        aria-label="Sincronizado"
      >
        ✓
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-stone-700/60 text-stone-400 text-[10px] animate-pulse"
        title="Sincronizando con Google"
        aria-label="Sincronizando"
      >
        ⋯
      </span>
    );
  }
  // status === 'error'
  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500/20 text-red-300 text-[10px] hover:bg-red-500/40 transition-colors"
      title="No se sincronizó · click para reintentar"
      aria-label="Reintentar sincronización"
    >
      {retrying ? '⋯' : '⚠'}
    </button>
  );
}
```

- [ ] **Step 3: Extend the Actividad type to carry sync_status**

Find the frontend type for Actividad (likely in `frontend/src/calendar/types.ts` or similar — search for "ActividadOut" or "Actividad type"):

```bash
grep -rn "actividad" frontend/src/calendar --include="*.ts" --include="*.tsx" | grep -i "type\|interface" | head
```

Add `sync_status?: 'pending' | 'synced' | 'error' | 'skipped'` and `gcal_event_id?: string | null` to the Actividad type definition.

- [ ] **Step 4: Wire badge into CalendarEvent.tsx**

In `frontend/src/calendar/components/CalendarEvent.tsx`, near where the activity's `titulo` is rendered, import the badge and conditionally render it:

```tsx
import ActividadSyncBadge from './ActividadSyncBadge';
import { useGcalStatus } from '../../sync';

// ... inside the component:
const { status: gcalStatus } = useGcalStatus(true);
const showBadge = gcalStatus?.enabled === true && actividad.sync_status;

// In the JSX where the title is, append:
{showBadge && actividad.sync_status && (
  <ActividadSyncBadge actividadId={actividad.id} status={actividad.sync_status} />
)}
```

Place the badge inline with the title (a small chip to the right of it), not overlapping the activity card.

NOTE: `useGcalStatus` polls every 2s. For a calendar view rendering many CalendarEvents, this is wasteful — only one should poll. Either:
- (a) Have `CalendarModule` poll once and pass `gcalEnabled` down via props or context.
- (b) Replace per-event `useGcalStatus` with a simple read from a context populated higher up.

Implement option (a): in `CalendarModule.tsx`, call `useGcalStatus(true)` once, then pass `gcalEnabled: boolean` as a prop to children. In `CalendarEvent`, accept `gcalEnabled` as a prop instead of polling.

- [ ] **Step 5: Backend serializer change — include `sync_status` in `/actividades` responses**

In `backend/main.py`, find `ActividadOut` (around line 226) and add the new field:

```python
class ActividadOut(BaseModel):
    id: str
    titulo: str
    descripcion: Optional[str] = None
    inicio: datetime
    fin: datetime
    estado: str
    sefirot: list[ActividadSefiraOut]
    serie_id: Optional[str] = None
    rrule: Optional[str] = None
    sync_status: str = "pending"
    gcal_event_id: Optional[str] = None
```

Update `serialize_actividad` (around line 262) to include these:

```python
    return ActividadOut(
        id=actividad.id,
        titulo=actividad.titulo,
        descripcion=actividad.descripcion,
        inicio=actividad.inicio,
        fin=actividad.fin,
        estado=actividad.estado,
        sefirot=sefirot,
        serie_id=actividad.serie_id,
        rrule=actividad.rrule,
        sync_status=actividad.sync_status,
        gcal_event_id=actividad.gcal_event_id,
    )
```

- [ ] **Step 6: Compile check + run tests**

```bash
cd frontend && npx tsc --noEmit
cd ../backend && pytest tests/ -v
```

Expected: both clean. Existing tests still pass because the new fields have defaults.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py frontend/src/calendar/ frontend/src/sync/
git commit -m "feat(gcal-frontend): per-activity sync badge with retry"
```

---

## Task 18: Manual smoke + open PR

**Files:** none (verification + PR step)

- [ ] **Step 1: Generate FERNET_KEY locally and update .env**

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Copy the output into `backend/.env` as `FERNET_KEY=<value>`.

- [ ] **Step 2: Register the new redirect URI in Google Cloud Console**

In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID, add `http://localhost:8000/sync/google/callback` to "Authorized redirect URIs". Save.

- [ ] **Step 3: Run migrations + start servers**

```bash
cd backend && alembic upgrade head && uvicorn main:app --reload --port 8000
# In another terminal:
cd frontend && npm run dev
```

- [ ] **Step 4: Walk through the 10 smoke checks from the spec**

Per spec §6 "Verificación manual (smoke)":

1. Log in with Google → `/settings` shows the card with "Activar sync" button.
2. Click activate → Google consent screen shows "Kabbalah quiere ver y editar tu calendario" → aceptar → returns to `/settings?sync=connected` → toast.
3. Verify in Google Calendar UI that a calendar "Kabbalah Space" appeared (empty if no prior actividades, populated if there were).
4. Create a single activity in Kabbalah → appears in Google Calendar within ~3 seconds.
5. Create a recurring weekly activity → appears in Google as a recurring event.
6. Edit a single instance of the recurring → appears in Google as an override.
7. Delete the whole series in Kabbalah → disappears from Google.
8. Disconnect Google → confirmation modal → confirm → calendar "Kabbalah Space" disappears from Google.
9. Empty `FERNET_KEY` from `.env`, restart backend → `/sync/*` returns 503, card grayed out.
10. With sync enabled but `google_refresh_token_enc=NULL` in DB → endpoints return 500 with log, frontend shows reconnect prompt.

- [ ] **Step 5: Run the full test suite one more time**

```bash
cd backend && pytest tests/ -v
cd ../frontend && npx tsc --noEmit && npx vite build
```

Expected: all green, build clean.

- [ ] **Step 6: Push and open PR**

```bash
git push -u origin feat/gcal-sync
gh pr create --title "feat: Google Calendar one-way sync (Kabbalah → Google)" --body "$(cat <<'EOF'
## Summary

Sync Kabbalah activities to the user's Google Calendar in one direction.
Creates a dedicated calendar "Kabbalah Space" in Google. Recurring activities
become single recurring events with RRULE. Backfill on activation. Async
push via FastAPI BackgroundTasks. Per-activity sync badge with retry.

Spec: docs/superpowers/specs/2026-05-14-gcal-one-way-sync-design.md
Plan: docs/superpowers/plans/2026-05-14-gcal-one-way-sync.md

## Test plan

- [ ] alembic upgrade head applies the migration cleanly
- [ ] pytest backend/tests/ all green
- [ ] vite build clean
- [ ] Google login + activate sync + create activity → appears in Google Calendar
- [ ] Recurring + override + delete-series + disconnect smoke checks pass
- [ ] Email user sees disabled state in /settings
- [ ] FERNET_KEY missing → endpoints return 503

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Final commit (if any leftover untracked verification artifacts)**

```bash
git status
# If there are untracked test outputs or coverage files, gitignore them or remove.
```

---

## Self-review notes (for the executor)

This plan covers all 8 sections of the spec:

- §2 Decisions tomadas → Tasks 1, 2, 8, 11
- §3.1 Modelo de datos → Task 2
- §3.2 OAuth flow extendido → Tasks 4, 11
- §3.3 Módulos backend → Tasks 5–10
- §3.4 Integración con endpoints existentes → Task 13
- §3.5 Manejo de series y overrides → Task 9 (update_actividad with override path) + Task 13 (PUT integration)
- §4 UX frontend → Tasks 14, 15, 16, 17
- §5 Edge cases → Covered across Tasks 8, 9, 13 (401 → disable, 404 → recreate, etc.)
- §6 Tests → Every backend task is TDD; Task 18 is the manual smoke
- §7 Riesgos → Mitigated in implementation (throttle in Task 10, FERNET_KEY 503 in Task 11)

Total: 18 tasks. Estimated 30-90 min each. ~15-25 hours of focused work.
