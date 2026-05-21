"""POST /reflexiones-libres — free-reflection endpoint with monthly gating.

Free tier: 1 reflexion per calendar month (anchored to the user's timezone).
Premium tier: unlimited.

The reflexion captures either a sefira-specific reflection (tipo='sefira',
sefira_id required) or a whole-tree reflection (tipo='arbol', sefira_id null).
"""
from datetime import datetime, timezone
from typing import Optional

from dateutil.tz import gettz

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator, ConfigDict
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Usuario
from billing.models import ReflexionLibre


router = APIRouter(prefix="/reflexiones-libres", tags=["reflexiones-libres"])


class ReflexionLibreCreate(BaseModel):
    tipo: str  # 'sefira' | 'arbol'
    sefira_id: Optional[str] = None
    contenido: str

    @model_validator(mode="after")
    def check_tipo_and_sefira(self):
        if self.tipo not in ("sefira", "arbol"):
            raise ValueError("tipo must be 'sefira' or 'arbol'")
        if self.tipo == "sefira" and not self.sefira_id:
            raise ValueError("sefira_id is required when tipo='sefira'")
        return self


class ReflexionLibreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tipo: str
    sefira_id: Optional[str]
    contenido: str
    fecha_creacion: datetime


def _user_month_start_utc(user: Usuario) -> datetime:
    """First instant of the user's current calendar month, in UTC."""
    tz_name = user.timezone or "America/Argentina/Buenos_Aires"
    tz = gettz(tz_name) or timezone.utc
    now_local = datetime.now(tz)
    month_start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return month_start_local.astimezone(timezone.utc)


@router.post("", response_model=ReflexionLibreOut, status_code=201)
async def create_reflexion_libre(
    payload: ReflexionLibreCreate,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_premium:
        month_start = _user_month_start_utc(user)
        count = (await db.execute(
            select(func.count(ReflexionLibre.id)).where(
                and_(
                    ReflexionLibre.usuario_id == user.id,
                    ReflexionLibre.fecha_creacion >= month_start,
                )
            )
        )).scalar() or 0
        if count >= 1:
            raise HTTPException(
                status_code=402,
                detail={"error": "premium_required", "reason": "free_reflection_limit"},
            )

    row = ReflexionLibre(
        usuario_id=user.id,
        tipo=payload.tipo,
        sefira_id=payload.sefira_id,
        contenido=payload.contenido,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
