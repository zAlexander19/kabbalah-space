"""Billing endpoints: checkout (Lemonsqueezy hosted page) and customer portal."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from config import Settings, get_settings
from database import get_db
from models import Usuario
from billing import lemonsqueezy
from billing.promo_codes import validate_promo_code, PromoCodeError


router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    plan: str  # 'monthly' | 'yearly'
    promo_code: Optional[str] = None

    @field_validator("plan")
    @classmethod
    def plan_valid(cls, v: str) -> str:
        if v not in ("monthly", "yearly"):
            raise ValueError("plan must be 'monthly' or 'yearly'")
        return v


class CheckoutResponse(BaseModel):
    checkout_url: str


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    payload: CheckoutRequest,
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    trial_days: Optional[int] = None
    if payload.promo_code:
        try:
            promo = await validate_promo_code(db, payload.promo_code)
            trial_days = promo.trial_days
        except PromoCodeError as e:
            raise HTTPException(status_code=400, detail=f"promo: {e}")

    variant_id = (
        settings.lemonsqueezy_variant_monthly if payload.plan == "monthly"
        else settings.lemonsqueezy_variant_yearly
    )

    url = await lemonsqueezy.create_checkout(
        settings,
        variant_id=variant_id,
        usuario_id=current_user.id,
        redirect_url=f"{settings.frontend_url}/billing/success",
        promo_code=payload.promo_code,
        trial_days=trial_days,
    )
    return {"checkout_url": url}


@router.get("/portal")
async def billing_portal(
    current_user: Usuario = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    if current_user.subscription is None:
        raise HTTPException(status_code=404, detail="no_subscription")
    url = await lemonsqueezy.get_customer_portal_url(
        settings, current_user.subscription.lemonsqueezy_customer_id
    )
    return {"portal_url": url}


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: str
    plan: str
    current_period_end: str
    trial_ends_at: Optional[str] = None
    canceled_at: Optional[str] = None


class StatusResponse(BaseModel):
    tier: str  # 'free' | 'premium'
    subscription: Optional[SubscriptionOut] = None


@router.get("/status", response_model=StatusResponse)
async def billing_status(current_user: Usuario = Depends(get_current_user)):
    if not current_user.is_premium:
        return {"tier": "free", "subscription": None}
    sub = current_user.subscription
    return {
        "tier": "premium",
        "subscription": {
            "status": sub.status,
            "plan": sub.plan,
            "current_period_end": sub.current_period_end.isoformat(),
            "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
            "canceled_at": sub.canceled_at.isoformat() if sub.canceled_at else None,
        },
    }
