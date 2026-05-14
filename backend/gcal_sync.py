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
