"""HTTP endpoints for email preferences."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Usuario
from billing.models import EmailPreferences


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
