import asyncio
import random
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from dateutil.rrule import rrulestr
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import engine, Base, get_db
from models import Sefira, PreguntaSefira, RespuestaPregunta, Actividad, ActividadSefira

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        async with AsyncSession(engine) as session:
            result = await session.execute(select(Sefira))
            if not result.scalars().first():
                sefirot_initials = [
                    {"id": "keter", "nombre": "Keter", "pilar": "Central", "descripcion": "La Corona."},
                    {"id": "jojma", "nombre": "Jojma", "pilar": "Derecho", "descripcion": "La Sabiduria."},
                    {"id": "bina", "nombre": "Bina", "pilar": "Izquierdo", "descripcion": "El Entendimiento."},
                    {"id": "jesed", "nombre": "Jesed", "pilar": "Derecho", "descripcion": "La Misericordia."},
                    {"id": "gevura", "nombre": "Guebura", "pilar": "Izquierdo", "descripcion": "La Severidad."},
                    {"id": "tiferet", "nombre": "Tiferet", "pilar": "Central", "descripcion": "La Belleza."},
                    {"id": "netzaj", "nombre": "Netsaj", "pilar": "Derecho", "descripcion": "La Victoria."},
                    {"id": "hod", "nombre": "Hod", "pilar": "Izquierdo", "descripcion": "El Esplendor."},
                    {"id": "yesod", "nombre": "Yesod", "pilar": "Central", "descripcion": "El Fundamento."},
                    {"id": "maljut", "nombre": "Maljut", "pilar": "Central", "descripcion": "El Reino."}
                ]
                for s in sefirot_initials:
                    session.add(Sefira(**s))
                await session.commit()


@app.get("/sefirot")
async def get_sefirot(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sefira).order_by(Sefira.nombre))
    return result.scalars().all()


def normalize_datetime(dt: datetime) -> datetime:
    if dt.tzinfo:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


class ActividadCreate(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    inicio: datetime
    fin: datetime
    sefirot_ids: list[str]
    rrule: Optional[str] = None


class ActividadSefiraOut(BaseModel):
    id: str
    nombre: str


class ActividadOut(BaseModel):
    id: str
    titulo: str
    descripcion: Optional[str] = None
    inicio: datetime
    fin: datetime
    estado: str
    sefirot: list[ActividadSefiraOut]
    serie_id: Optional[str] = None
    rrule: Optional[str] = None


class VolumenSefiraOut(BaseModel):
    sefira_id: str
    sefira_nombre: str
    horas_total: float
    actividades_total: int


class VolumenSemanalOut(BaseModel):
    semana_inicio: date
    semana_fin: date
    volumen: list[VolumenSefiraOut]


async def validate_sefirot_ids(db: AsyncSession, sefirot_ids: list[str]) -> None:
    if not sefirot_ids:
        raise HTTPException(status_code=422, detail="Cada actividad debe tener al menos una sefira")

    result = await db.execute(select(Sefira.id).where(Sefira.id.in_(sefirot_ids)))
    found = {row[0] for row in result.all()}
    missing = sorted(set(sefirot_ids) - found)
    if missing:
        raise HTTPException(status_code=422, detail=f"Sefirot inválidas: {', '.join(missing)}")


async def serialize_actividad(db: AsyncSession, actividad: Actividad) -> ActividadOut:
    sefirot_result = await db.execute(
        select(Sefira.id, Sefira.nombre)
        .join(ActividadSefira, ActividadSefira.sefira_id == Sefira.id)
        .where(ActividadSefira.actividad_id == actividad.id)
        .order_by(Sefira.nombre)
    )
    sefirot = [ActividadSefiraOut(id=row.id, nombre=row.nombre) for row in sefirot_result.all()]
    return ActividadOut(
        id=actividad.id,
        titulo=actividad.titulo,
        descripcion=actividad.descripcion,
        inicio=actividad.inicio,
        fin=actividad.fin,
        estado=actividad.estado,
        sefirot=sefirot,
        serie_id=actividad.serie_id,
        rrule=actividad.rrule,
    )

MATERIALIZATION_CAP_DAYS = 365


async def materialize_series(
    db: AsyncSession,
    payload: ActividadCreate,
    serie_id: str,
    sefirot_ids: list[str],
    range_start: Optional[datetime] = None,
    range_end: Optional[datetime] = None,
) -> list[Actividad]:
    """Generate and persist instances of a recurring series."""
    if not payload.rrule:
        raise HTTPException(status_code=422, detail="rrule requerido para materializar")

    duration = payload.fin - payload.inicio
    base_start = normalize_datetime(payload.inicio)
    window_start = range_start or base_start
    window_end = range_end or (base_start + timedelta(days=MATERIALIZATION_CAP_DAYS))

    rule = rrulestr(payload.rrule, dtstart=base_start)
    occurrences = list(rule.between(window_start, window_end, inc=True))

    titulo = payload.titulo.strip()
    descripcion = (payload.descripcion or "").strip() or None

    created: list[Actividad] = []
    for idx, occ_start in enumerate(occurrences):
        actividad = Actividad(
            titulo=titulo,
            descripcion=descripcion,
            inicio=occ_start,
            fin=occ_start + duration,
            estado="pendiente",
            serie_id=serie_id,
            rrule=payload.rrule if (idx == 0 and range_start is None) else None,
        )
        db.add(actividad)
        created.append(actividad)

    await db.flush()

    for instancia in created:
        for sefira_id in sefirot_ids:
            db.add(ActividadSefira(actividad_id=instancia.id, sefira_id=sefira_id))

    return created


class EvaluationRequest(BaseModel):
    sefira: str
    text: str
    score: float

class EvaluationResponse(BaseModel):
    ai_score: float
    feedback: str

@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(request: EvaluationRequest):
    await asyncio.sleep(1)
    analysis = min(10.0, max(1.0, request.score + random.choice([-1.5, -0.5, 0.0, 0.5, 1.5])))
    return EvaluationResponse(
        ai_score=analysis,
        feedback=f"Análisis del Espejo Cognitivo para {request.sefira}:\nEl texto '[...]' denota una energia particular que requirio un ajuste aurico."
    )

class PreguntaCreate(BaseModel):
    sefira_id: str
    texto: str

@app.get("/preguntas/{sefira_id}")
async def get_preguntas(sefira_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PreguntaSefira).where(PreguntaSefira.sefira_id == sefira_id))
    return result.scalars().all()

@app.post("/preguntas")
async def add_pregunta(pregunta: PreguntaCreate, db: AsyncSession = Depends(get_db)):
    nueva_pregunta = PreguntaSefira(sefira_id=pregunta.sefira_id, texto_pregunta=pregunta.texto)
    db.add(nueva_pregunta)
    await db.commit()
    await db.refresh(nueva_pregunta)
    return nueva_pregunta

@app.delete("/preguntas/{pregunta_id}")
async def delete_pregunta(pregunta_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PreguntaSefira).where(PreguntaSefira.id == pregunta_id))
    pregunta = result.scalars().first()
    if not pregunta:
        raise HTTPException(status_code=404, detail="Pregunta not found")
    await db.delete(pregunta)
    await db.commit()
    return {"message": "Deleted successfully"}

class RespuestaCreate(BaseModel):
    pregunta_id: str
    respuesta_texto: str

@app.post("/respuestas")
async def save_respuesta(rep: RespuestaCreate, db: AsyncSession = Depends(get_db)):
    nueva_res = RespuestaPregunta(pregunta_id=rep.pregunta_id, respuesta_texto=rep.respuesta_texto)
    db.add(nueva_res)
    await db.commit()
    await db.refresh(nueva_res)
    return nueva_res


@app.get("/actividades", response_model=list[ActividadOut])
async def list_actividades(
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Actividad).order_by(Actividad.inicio)
    if start and end:
        start_dt = normalize_datetime(start)
        end_dt = normalize_datetime(end)
        query = query.where(and_(Actividad.inicio < end_dt, Actividad.fin > start_dt))

    result = await db.execute(query)
    actividades = result.scalars().all()
    return [await serialize_actividad(db, actividad) for actividad in actividades]


@app.get("/actividades/{actividad_id}", response_model=ActividadOut)
async def get_actividad(actividad_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Actividad).where(Actividad.id == actividad_id))
    actividad = result.scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    return await serialize_actividad(db, actividad)


@app.post("/actividades", response_model=ActividadOut)
async def create_actividad(payload: ActividadCreate, db: AsyncSession = Depends(get_db)):
    if payload.fin <= payload.inicio:
        raise HTTPException(status_code=422, detail="La fecha de fin debe ser mayor a la fecha de inicio")
    await validate_sefirot_ids(db, payload.sefirot_ids)

    actividad = Actividad(
        titulo=payload.titulo.strip(),
        descripcion=(payload.descripcion or "").strip() or None,
        inicio=normalize_datetime(payload.inicio),
        fin=normalize_datetime(payload.fin),
        estado="pendiente",
    )
    db.add(actividad)
    await db.flush()

    for sefira_id in payload.sefirot_ids:
        db.add(ActividadSefira(actividad_id=actividad.id, sefira_id=sefira_id))

    await db.commit()
    await db.refresh(actividad)
    return await serialize_actividad(db, actividad)


@app.put("/actividades/{actividad_id}", response_model=ActividadOut)
async def update_actividad(actividad_id: str, payload: ActividadCreate, db: AsyncSession = Depends(get_db)):
    if payload.fin <= payload.inicio:
        raise HTTPException(status_code=422, detail="La fecha de fin debe ser mayor a la fecha de inicio")
    await validate_sefirot_ids(db, payload.sefirot_ids)

    result = await db.execute(select(Actividad).where(Actividad.id == actividad_id))
    actividad = result.scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    actividad.titulo = payload.titulo.strip()
    actividad.descripcion = (payload.descripcion or "").strip() or None
    actividad.inicio = normalize_datetime(payload.inicio)
    actividad.fin = normalize_datetime(payload.fin)

    current_tags = await db.execute(
        select(ActividadSefira).where(ActividadSefira.actividad_id == actividad_id)
    )
    for tag in current_tags.scalars().all():
        await db.delete(tag)

    for sefira_id in payload.sefirot_ids:
        db.add(ActividadSefira(actividad_id=actividad.id, sefira_id=sefira_id))

    await db.commit()
    await db.refresh(actividad)
    return await serialize_actividad(db, actividad)


@app.delete("/actividades/{actividad_id}")
async def delete_actividad(actividad_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Actividad).where(Actividad.id == actividad_id))
    actividad = result.scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    await db.delete(actividad)
    await db.commit()
    return {"message": "Actividad eliminada"}


@app.get("/energia/volumen-semanal", response_model=VolumenSemanalOut)
async def get_volumen_semanal(fecha: Optional[date] = None, db: AsyncSession = Depends(get_db)):
    target_date = fecha or datetime.utcnow().date()
    semana_inicio = target_date - timedelta(days=target_date.weekday())
    semana_fin = semana_inicio + timedelta(days=6)

    week_start_dt = datetime.combine(semana_inicio, time.min)
    week_end_dt = datetime.combine(semana_fin + timedelta(days=1), time.min)

    sefirot_result = await db.execute(select(Sefira).order_by(Sefira.nombre))
    sefirot = sefirot_result.scalars().all()

    aggregate = {
        sefira.id: {
            "sefira_id": sefira.id,
            "sefira_nombre": sefira.nombre,
            "horas_total": 0.0,
            "_actividad_ids": set(),
        }
        for sefira in sefirot
    }

    rows = await db.execute(
        select(
            Actividad.id.label("actividad_id"),
            Actividad.inicio,
            Actividad.fin,
            Sefira.id.label("sefira_id"),
        )
        .join(ActividadSefira, ActividadSefira.actividad_id == Actividad.id)
        .join(Sefira, Sefira.id == ActividadSefira.sefira_id)
        .where(and_(Actividad.inicio < week_end_dt, Actividad.fin > week_start_dt))
    )

    for row in rows.all():
        overlap_start = max(row.inicio, week_start_dt)
        overlap_end = min(row.fin, week_end_dt)
        duration_hours = max(0.0, (overlap_end - overlap_start).total_seconds() / 3600.0)

        item = aggregate[row.sefira_id]
        item["horas_total"] += duration_hours
        item["_actividad_ids"].add(row.actividad_id)

    volumen = []
    for item in aggregate.values():
        volumen.append(
            VolumenSefiraOut(
                sefira_id=item["sefira_id"],
                sefira_nombre=item["sefira_nombre"],
                horas_total=round(item["horas_total"], 2),
                actividades_total=len(item["_actividad_ids"]),
            )
        )

    volumen.sort(key=lambda x: (x.actividades_total, x.horas_total), reverse=True)
    return VolumenSemanalOut(semana_inicio=semana_inicio, semana_fin=semana_fin, volumen=volumen)
