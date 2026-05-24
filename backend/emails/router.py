"""HTTP endpoints for email preferences."""
import base64
import hashlib
import hmac
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func as sql_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Usuario
from billing.models import EmailPreferences


logger = logging.getLogger(__name__)
HARD_BOUNCE_THRESHOLD = 3


router = APIRouter(tags=["emails"])


class EmailPreferencesOut(BaseModel):
    weekly_summary: bool
    monthly_summary: bool
    imbalance_alerts: bool
    reflection_reminders: bool

    class Config:
        from_attributes = True


class EmailPreferencesPatch(BaseModel):
    weekly_summary: Optional[bool] = None
    monthly_summary: Optional[bool] = None
    imbalance_alerts: Optional[bool] = None
    reflection_reminders: Optional[bool] = None


@router.get("/email/preferences", response_model=EmailPreferencesOut)
async def get_email_preferences(
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = (await db.execute(
        select(EmailPreferences).where(EmailPreferences.usuario_id == current_user.id)
    )).scalars().first()
    if prefs is None:
        raise HTTPException(status_code=404, detail="no_email_preferences")
    return prefs


@router.put("/email/preferences", response_model=EmailPreferencesOut)
async def update_email_preferences(
    payload: EmailPreferencesPatch,
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = (await db.execute(
        select(EmailPreferences).where(EmailPreferences.usuario_id == current_user.id)
    )).scalars().first()
    if prefs is None:
        raise HTTPException(status_code=404, detail="no_email_preferences")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prefs, field, value)
    await db.commit()
    await db.refresh(prefs)
    return prefs


def _verify_resend_signature(body: bytes, signature: str, secret: str) -> bool:
    """Resend uses Svix-style signatures: 'v1,<base64-hmac-sha256>'."""
    if not signature or not secret:
        return False
    try:
        version, sig_b64 = signature.split(",", 1)
    except ValueError:
        return False
    if version != "v1":
        return False
    expected_digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    expected_b64 = base64.b64encode(expected_digest).decode()
    return hmac.compare_digest(expected_b64, sig_b64)


@router.post("/webhooks/resend")
async def resend_webhook(
    request: Request,
    svix_signature: Optional[str] = Header(default=None, alias="Svix-Signature"),
    db: AsyncSession = Depends(get_db),
):
    from config import get_settings
    settings = get_settings()

    body = await request.body()
    if not _verify_resend_signature(body, svix_signature or "", settings.resend_webhook_secret):
        raise HTTPException(status_code=401, detail="invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")

    event_type = payload.get("type")
    email_id = payload.get("data", {}).get("email_id")
    if not event_type or not email_id:
        raise HTTPException(status_code=400, detail="malformed payload")

    # Lazy import to avoid circular
    from emails.models import EmailLog

    log = (await db.execute(
        select(EmailLog).where(EmailLog.provider_message_id == email_id)
    )).scalars().first()
    if log is None:
        logger.info("resend webhook for unknown email_id=%s; ignoring", email_id)
        return {"status": "unknown_email"}

    status_map = {
        "email.delivered": "delivered",
        "email.bounced": "bounced",
        "email.complained": "complained",
    }
    new_status = status_map.get(event_type)
    if new_status is None:
        # delivery_delayed and other informational events: no state change
        return {"status": "ignored"}

    log.status = new_status
    await db.commit()

    # If this user has hit the hard-bounce threshold, pause all their emails
    if event_type == "email.bounced":
        bounce_count = (await db.execute(
            select(sql_func.count(EmailLog.id)).where(
                EmailLog.usuario_id == log.usuario_id,
                EmailLog.status == "bounced",
            )
        )).scalar() or 0
        if bounce_count >= HARD_BOUNCE_THRESHOLD:
            prefs = (await db.execute(
                select(EmailPreferences).where(EmailPreferences.usuario_id == log.usuario_id)
            )).scalars().first()
            if prefs is not None:
                prefs.weekly_summary = False
                prefs.monthly_summary = False
                prefs.imbalance_alerts = False
                prefs.reflection_reminders = False
                await db.commit()
                logger.warning(
                    "paused all emails for usuario_id=%s after %d hard bounces",
                    log.usuario_id, bounce_count,
                )

    return {"status": "ok"}
