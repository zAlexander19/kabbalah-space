"""Promo code validation (premium trial gating).

Validation reads the PromoCode row; the uses_count is incremented LATER by
the webhook handler when subscription_created confirms the conversion (Task 13).
This avoids burning a use on an abandoned checkout.
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from billing.models import PromoCode


class PromoCodeError(Exception):
    """Base for promo code validation errors. The message is shown to the user."""


async def validate_promo_code(db: AsyncSession, code: str) -> PromoCode:
    """Return the PromoCode if valid for use right now. Raise PromoCodeError otherwise."""
    promo = (await db.execute(
        select(PromoCode).where(PromoCode.code == code)
    )).scalars().first()
    if promo is None:
        raise PromoCodeError("promo code not found")
    if promo.expires_at and promo.expires_at < datetime.now(timezone.utc):
        raise PromoCodeError("promo code expired")
    if promo.max_uses is not None and (promo.uses_count or 0) >= promo.max_uses:
        raise PromoCodeError("promo code exhausted")
    return promo
