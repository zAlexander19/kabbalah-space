"""Endpoints del panel de administrador. Todos exigen require_admin."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from admin.deps import require_admin
from admin.schemas import (
    PreguntaCreateIn, PreguntaOut, PreguntaUpdateIn, PreguntaReorderIn,
    UsuarioAdminOut, UsuariosListOut,
)
from database import get_db
from models import PreguntaSefira, Usuario

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/ping")
async def ping(_: Usuario = Depends(require_admin)):
    return {"ok": True}


@router.get("/usuarios", response_model=UsuariosListOut)
async def list_usuarios(
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    base = select(Usuario)
    count_q = select(func.count()).select_from(Usuario)
    if search:
        like = f"%{search.lower()}%"
        cond = func.lower(Usuario.nombre).like(like) | func.lower(Usuario.email).like(like)
        base = base.where(cond)
        count_q = count_q.where(cond)
    total = (await db.execute(count_q)).scalar() or 0
    rows = (await db.execute(
        base.order_by(Usuario.fecha_creacion.desc()).limit(limit).offset(offset)
    )).scalars().all()
    items = [
        UsuarioAdminOut(
            id=u.id, nombre=u.nombre, email=u.email, provider=u.provider,
            is_admin=u.is_admin, is_premium=u.is_premium, fecha_creacion=u.fecha_creacion,
        )
        for u in rows
    ]
    return UsuariosListOut(total=total, items=items)


@router.get("/preguntas/{sefira_id}", response_model=list[PreguntaOut])
async def list_preguntas(
    sefira_id: str,
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(PreguntaSefira)
        .where(PreguntaSefira.sefira_id == sefira_id)
        .order_by(PreguntaSefira.orden)
    )).scalars().all()
    return rows


@router.post("/preguntas", response_model=PreguntaOut, status_code=201)
async def create_pregunta(
    payload: PreguntaCreateIn,
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    max_orden = (await db.execute(
        select(func.max(PreguntaSefira.orden))
        .where(PreguntaSefira.sefira_id == payload.sefira_id)
    )).scalar()
    nueva = PreguntaSefira(
        sefira_id=payload.sefira_id,
        texto_pregunta=payload.texto,
        orden=0 if max_orden is None else max_orden + 1,
    )
    db.add(nueva)
    await db.commit()
    await db.refresh(nueva)
    return nueva


@router.patch("/preguntas/{pregunta_id}", response_model=PreguntaOut)
async def update_pregunta(
    pregunta_id: str,
    payload: PreguntaUpdateIn,
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    pregunta = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.id == pregunta_id)
    )).scalars().first()
    if pregunta is None:
        raise HTTPException(404, "Pregunta no encontrada")
    pregunta.texto_pregunta = payload.texto
    await db.commit()
    await db.refresh(pregunta)
    return pregunta


@router.delete("/preguntas/{pregunta_id}")
async def delete_pregunta(
    pregunta_id: str,
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    pregunta = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.id == pregunta_id)
    )).scalars().first()
    if pregunta is None:
        raise HTTPException(404, "Pregunta no encontrada")
    await db.delete(pregunta)
    await db.commit()
    return {"ok": True}


@router.put("/preguntas/{sefira_id}/orden")
async def reorder_preguntas(
    sefira_id: str,
    payload: PreguntaReorderIn,
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.sefira_id == sefira_id)
    )).scalars().all()
    actuales = {p.id for p in rows}
    if set(payload.ids) != actuales:
        raise HTTPException(400, "La lista de ids no coincide con las preguntas de la sefira")
    by_id = {p.id: p for p in rows}
    for idx, pid in enumerate(payload.ids):
        by_id[pid].orden = idx
    await db.commit()
    return {"ok": True}
