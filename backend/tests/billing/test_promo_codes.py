"""Unit tests for billing.promo_codes.validate_promo_code."""
import pytest
from datetime import datetime, timedelta, timezone

from billing.models import PromoCode
from billing.promo_codes import validate_promo_code, PromoCodeError


@pytest.mark.asyncio
async def test_validate_returns_valid_promo(db_session):
    db_session.add(PromoCode(code="VALID", trial_days=7, max_uses=10, uses_count=0))
    await db_session.commit()

    result = await validate_promo_code(db_session, "VALID")
    assert result.code == "VALID"
    assert result.trial_days == 7


@pytest.mark.asyncio
async def test_validate_raises_on_unknown_code(db_session):
    with pytest.raises(PromoCodeError, match="not found"):
        await validate_promo_code(db_session, "DOESNT_EXIST")


@pytest.mark.asyncio
async def test_validate_raises_on_expired(db_session):
    db_session.add(PromoCode(
        code="OLD", trial_days=7,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    ))
    await db_session.commit()

    with pytest.raises(PromoCodeError, match="expired"):
        await validate_promo_code(db_session, "OLD")


@pytest.mark.asyncio
async def test_validate_raises_on_exhausted(db_session):
    db_session.add(PromoCode(code="DONE", trial_days=7, max_uses=1, uses_count=1))
    await db_session.commit()

    with pytest.raises(PromoCodeError, match="exhausted"):
        await validate_promo_code(db_session, "DONE")


@pytest.mark.asyncio
async def test_validate_unlimited_uses_when_max_uses_null(db_session):
    """max_uses=None means unlimited - uses_count is ignored."""
    db_session.add(PromoCode(code="UNLIMITED", trial_days=7, max_uses=None, uses_count=999))
    await db_session.commit()

    result = await validate_promo_code(db_session, "UNLIMITED")
    assert result.code == "UNLIMITED"


@pytest.mark.asyncio
async def test_validate_passes_with_future_expiry(db_session):
    db_session.add(PromoCode(
        code="STILL_OK", trial_days=7,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    ))
    await db_session.commit()

    result = await validate_promo_code(db_session, "STILL_OK")
    assert result.trial_days == 7
