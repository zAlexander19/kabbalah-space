"""Lemonsqueezy webhook handler.

Verifies HMAC signature, deduplicates events via the webhook_events table,
and dispatches to per-event handlers (filled in Tasks 13-15).

Lemonsqueezy sends the signature in the X-Signature header. The signature is
HMAC-SHA256 of the raw request body keyed by the webhook secret.
"""
import hmac
import hashlib
import logging
from datetime import datetime, timezone
from typing import Callable, Awaitable

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings, get_settings
from database import get_db
from billing.models import Subscription, EmailPreferences, PromoCode, WebhookEvent


logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


def _parse_ls_dt(s: str) -> datetime:
    """Parse Lemonsqueezy ISO timestamp like '2026-05-21T00:00:00.000000Z'."""
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


_STATUS_MAP = {
    "on_trial": "trial",
    "active": "active",
    "past_due": "past_due",
    "unpaid": "past_due",
    "cancelled": "canceled",
    "expired": "expired",
    "paused": "expired",
}


def _map_status(ls_status: str) -> str:
    return _STATUS_MAP.get(ls_status, "expired")


def _infer_plan(attrs: dict, settings: Settings) -> str:
    """Pick 'yearly' if variant matches the yearly setting, else 'monthly'."""
    variant = str(attrs.get("variant_id", ""))
    return "yearly" if variant == settings.lemonsqueezy_variant_yearly else "monthly"


async def _find_sub(db: AsyncSession, sub_id: str) -> Subscription | None:
    return (await db.execute(
        select(Subscription).where(Subscription.lemonsqueezy_subscription_id == sub_id)
    )).scalars().first()


async def handle_subscription_created(payload: dict, db: AsyncSession):
    """INSERT Subscription + EmailPreferences; bump promo uses_count if applicable."""
    settings = get_settings()
    attrs = payload["data"]["attributes"]
    custom = payload.get("meta", {}).get("custom_data") or {}
    usuario_id = custom.get("usuario_id")
    if not usuario_id:
        logger.warning("subscription_created missing usuario_id in custom_data; ignoring")
        return

    now = datetime.now(timezone.utc)
    period_start = _parse_ls_dt(attrs["created_at"]) if attrs.get("created_at") else now
    period_end = _parse_ls_dt(attrs["renews_at"]) if attrs.get("renews_at") else now
    trial_ends = _parse_ls_dt(attrs["trial_ends_at"]) if attrs.get("trial_ends_at") else None

    sub = Subscription(
        usuario_id=usuario_id,
        status=_map_status(attrs.get("status", "")),
        plan=_infer_plan(attrs, settings),
        lemonsqueezy_subscription_id=payload["data"]["id"],
        lemonsqueezy_customer_id=str(attrs.get("customer_id", "")),
        trial_ends_at=trial_ends,
        current_period_start=period_start,
        current_period_end=period_end,
    )
    db.add(sub)

    prefs = EmailPreferences(usuario_id=usuario_id)
    db.add(prefs)

    promo_code = custom.get("promo_code")
    if promo_code:
        promo = (await db.execute(
            select(PromoCode).where(PromoCode.code == promo_code)
        )).scalars().first()
        if promo:
            promo.uses_count = (promo.uses_count or 0) + 1

    await db.commit()


async def handle_subscription_updated(payload: dict, db: AsyncSession):
    sub = await _find_sub(db, payload["data"]["id"])
    if sub is None:
        logger.warning("subscription_updated unknown sub_id=%s", payload["data"]["id"])
        return
    attrs = payload["data"]["attributes"]
    sub.status = _map_status(attrs.get("status", sub.status))
    if attrs.get("renews_at"):
        sub.current_period_end = _parse_ls_dt(attrs["renews_at"])
    await db.commit()


async def handle_subscription_cancelled(payload: dict, db: AsyncSession):
    sub = await _find_sub(db, payload["data"]["id"])
    if sub is None:
        return
    attrs = payload["data"]["attributes"]
    sub.status = "canceled"
    sub.canceled_at = datetime.now(timezone.utc)
    if attrs.get("ends_at"):
        sub.current_period_end = _parse_ls_dt(attrs["ends_at"])
    await db.commit()


async def handle_subscription_expired(payload: dict, db: AsyncSession):
    sub = await _find_sub(db, payload["data"]["id"])
    if sub is None:
        return
    sub.status = "expired"
    await db.commit()


async def handle_subscription_payment_failed(payload: dict, db: AsyncSession):
    sub = await _find_sub(db, payload["data"]["id"])
    if sub is None:
        return
    sub.status = "past_due"
    await db.commit()
    logger.warning("payment failed for sub=%s usuario=%s", sub.lemonsqueezy_subscription_id, sub.usuario_id)


async def handle_subscription_payment_recovered(payload: dict, db: AsyncSession):
    sub = await _find_sub(db, payload["data"]["id"])
    if sub is None:
        return
    sub.status = "active"
    await db.commit()


EVENT_HANDLERS: dict[str, Callable[[dict, AsyncSession], Awaitable[None]]] = {
    "subscription_created": handle_subscription_created,
    "subscription_updated": handle_subscription_updated,
    "subscription_cancelled": handle_subscription_cancelled,
    "subscription_expired": handle_subscription_expired,
    "subscription_payment_failed": handle_subscription_payment_failed,
    "subscription_payment_recovered": handle_subscription_payment_recovered,
}


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
