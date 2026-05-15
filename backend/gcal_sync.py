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


from typing import Callable, AsyncContextManager

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
            pass
        except GcalError as exc:
            logger.error("delete_actividad failed: %s", exc)


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
