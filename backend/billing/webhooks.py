"""Lemonsqueezy webhook handler.

Verifies HMAC signature, deduplicates events via the webhook_events table,
and dispatches to per-event handlers (filled in Tasks 13-15).

Lemonsqueezy sends the signature in the X-Signature header. The signature is
HMAC-SHA256 of the raw request body keyed by the webhook secret.
"""
import hmac
import hashlib
import logging
from typing import Callable, Awaitable

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings, get_settings
from database import get_db
from billing.models import WebhookEvent


logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


# Per-event handlers. Populated by handlers module (Tasks 13-15) which imports
# this module and writes to EVENT_HANDLERS. Empty here keeps Task 12 self-contained.
EVENT_HANDLERS: dict[str, Callable[[dict, AsyncSession], Awaitable[None]]] = {}


def _verify_signature(body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    # constant-time compare to avoid timing oracle
    return hmac.compare_digest(expected, signature)


@router.post("/webhooks/lemonsqueezy")
async def lemonsqueezy_webhook(
    request: Request,
    x_signature: str | None = Header(default=None, alias="X-Signature"),
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_db),
):
    body = await request.body()
    if not _verify_signature(body, x_signature or "", settings.lemonsqueezy_webhook_secret):
        raise HTTPException(status_code=401, detail="invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")

    event_name = payload.get("meta", {}).get("event_name")
    event_id = payload.get("data", {}).get("id")
    if not event_name or not event_id:
        raise HTTPException(status_code=400, detail="malformed payload")

    # Idempotency: insert into webhook_events. If UNIQUE fails, we already processed.
    db.add(WebhookEvent(provider="lemonsqueezy", event_id=str(event_id), event_type=event_name))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        logger.info("webhook duplicate skipped event_id=%s type=%s", event_id, event_name)
        return {"status": "duplicate_ignored"}

    handler = EVENT_HANDLERS.get(event_name)
    if handler is None:
        logger.info("webhook unhandled event_type=%s event_id=%s", event_name, event_id)
        return {"status": "ok"}

    await handler(payload, db)
    return {"status": "ok"}
