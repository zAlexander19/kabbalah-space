import asyncio
import logging
import random
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from dateutil.rrule import rrulestr
from fastapi import BackgroundTasks, FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import and_, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from urllib.parse import urlencode

import httpx

from config import Settings, get_settings
from database import engine, Base, get_db
from models import Sefira, PreguntaSefira, RespuestaPregunta, RegistroDiario, Actividad, ActividadSefira, Usuario
import gcal_sync
from gcal_client import GcalError

logger = logging.getLogger(__name__)
from auth import (
    EmailCollisionError,
    GOOGLE_AUTH_URL,
    Token,
    UserCreate,
    UserLogin,
    UserOut,
    build_google_authorize_url,
    create_access_token,
    create_state_token,
    exchange_google_code,
    fetch_google_userinfo,
    find_or_create_google_user,
    get_current_user,
    hash_password,
    verify_password,
    verify_state_token,
)
from billing.reflexiones_libres import router as reflexiones_libres_router
from billing.routers import router as billing_router
from billing.webhooks import router as webhooks_router
from emails.router import router as emails_router
from scheduler.scheduler import start_scheduler, stop_scheduler

settings = get_settings()


@asynccontextmanager
async def lifespan(app):
    # Startup: arrancar el scheduler de emails sólo si el kill switch está activo.
    # El seeding inicial de la DB sigue vivo en el handler @app.on_event("startup")
    # más abajo; FastAPI ejecuta ambos.
    settings_for_lifespan = get_settings()
    if settings_for_lifespan.emails_enabled:
        start_scheduler()
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(lifespan=lifespan)

from llm import KSpaceAi
kspace_ai = KSpaceAi(provider=settings.llm_provider, api_key=settings.gemini_api_key)

# Premium tier limits
FREE_ACTIVIDAD_LIMIT = 10
FREE_COOLDOWN_DAYS = 30
PREMIUM_COOLDOWN_DAYS = 7
FREE_HISTORICO_MONTHS = 12

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reflexiones_libres_router)
app.include_router(billing_router)
app.include_router(webhooks_router)
app.include_router(emails_router)


@app.get("/health")
async def health(s: Settings = Depends(get_settings)):
    return {"status": "ok", "llm_provider": s.llm_provider}


@app.get("/auth/config")
async def auth_config(s: Settings = Depends(get_settings)):
    """Public auth feature flags. The frontend hits this on bootstrap to
    decide which login methods to render."""
    return {
        "google_oauth_enabled": s.google_oauth_configured,
    }


# ---------------------------------------------------------------- AUTH

@app.post("/auth/register", response_model=UserOut, status_code=201)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(
        select(Usuario).where(Usuario.email == payload.email)
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email")

    user = Usuario(
        email=payload.email,
        nombre=payload.nombre.strip(),
        password_hash=hash_password(payload.password),
        provider="email",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@app.post("/auth/login", response_model=Token)
async def login(
    payload: UserLogin,
    db: AsyncSession = Depends(get_db),
    s: Settings = Depends(get_settings),
):
    user = (await db.execute(
        select(Usuario).where(Usuario.email == payload.email)
    )).scalars().first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    return Token(access_token=create_access_token(user.id, s))


@app.get("/auth/me", response_model=UserOut)
async def me(user: Usuario = Depends(get_current_user)):
    return user


class UsuarioPatch(BaseModel):
    nombre: Optional[str] = None


@app.patch("/usuarios/me", response_model=UserOut)
async def update_me(
    payload: UsuarioPatch,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """Patch the current user's editable profile fields. Email/provider are
    immutable from the API; changing those needs a re-verification flow."""
    data = payload.model_dump(exclude_unset=True)
    if "nombre" in data:
        nombre = (data["nombre"] or "").strip()
        if not nombre:
            raise HTTPException(status_code=422, detail="El nombre no puede estar vacío")
        if len(nombre) > 100:
            raise HTTPException(status_code=422, detail="El nombre es demasiado largo")
        user.nombre = nombre
    await db.commit()
    await db.refresh(user)
    return user


class KsaiToggleRequest(BaseModel):
    enabled: bool


@app.patch("/usuarios/me/ksai", response_model=UserOut)
async def patch_ksai_toggle(
    payload: KsaiToggleRequest,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    user.ksai_enabled = payload.enabled
    await db.commit()
    await db.refresh(user)
    return user


# ---------------------------------------------------------------- GOOGLE OAUTH

def _redirect_to_frontend(s: Settings, fragment: str) -> RedirectResponse:
    """Send the user back to the SPA with a success/error fragment.
    Fragments live behind '#' so they don't end up in server logs / referers.
    """
    return RedirectResponse(f"{s.frontend_url}/auth/return{fragment}", status_code=302)


@app.get("/auth/google/authorize")
async def google_authorize(s: Settings = Depends(get_settings)):
    if not s.google_oauth_configured:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth no configurado en este backend (falta GOOGLE_CLIENT_ID / SECRET en .env)",
        )
    state = create_state_token(s)
    return RedirectResponse(build_google_authorize_url(s, state), status_code=302)


@app.get("/auth/google/callback")
async def google_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    s: Settings = Depends(get_settings),
):
    # User cancelled or Google returned an error
    if error:
        return _redirect_to_frontend(s, f"#error={error}")

    if not code or not state:
        return _redirect_to_frontend(s, "#error=missing_params")

    if not verify_state_token(state, s):
        return _redirect_to_frontend(s, "#error=invalid_state")

    # Exchange code for tokens
    try:
        tokens = await exchange_google_code(code, s)
    except Exception:
        return _redirect_to_frontend(s, "#error=token_exchange_failed")

    access_token = tokens.get("access_token")
    if not access_token:
        return _redirect_to_frontend(s, "#error=no_access_token")

    # Fetch the Google user profile
    try:
        userinfo = await fetch_google_userinfo(access_token)
    except Exception:
        return _redirect_to_frontend(s, "#error=userinfo_failed")

    google_sub = userinfo.get("sub")
    google_email = userinfo.get("email")
    google_name = userinfo.get("name") or ""
    if not google_sub or not google_email:
        return _redirect_to_frontend(s, "#error=incomplete_profile")

    # Find or create the local user
    try:
        user = await find_or_create_google_user(db, google_sub, google_email, google_name)
    except EmailCollisionError:
        return _redirect_to_frontend(s, "#error=email_already_registered")

    # Issue our own JWT and bounce the user back to the SPA
    jwt_token = create_access_token(user.id, s)
    return _redirect_to_frontend(s, f"#token={jwt_token}")


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        async with AsyncSession(engine) as session:
            result = await session.execute(select(Sefira))
            if not result.scalars().first():
                sefirot_initials = [
                    {"id": "keter", "nombre": "Kéter", "pilar": "Central", "descripcion": "La Corona."},
                    {"id": "jojma", "nombre": "Jojmá", "pilar": "Derecho", "descripcion": "La Sabiduria."},
                    {"id": "bina", "nombre": "Biná", "pilar": "Izquierdo", "descripcion": "El Entendimiento."},
                    {"id": "jesed", "nombre": "Jésed", "pilar": "Derecho", "descripcion": "La Misericordia."},
                    {"id": "gevura", "nombre": "Gueburá", "pilar": "Izquierdo", "descripcion": "La Severidad."},
                    {"id": "tiferet", "nombre": "Tiféret", "pilar": "Central", "descripcion": "La Belleza."},
                    {"id": "netzaj", "nombre": "Nétsaj", "pilar": "Derecho", "descripcion": "La Victoria."},
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
    sync_status: str = "pending"
    gcal_event_id: Optional[str] = None


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
        sync_status=actividad.sync_status,
        gcal_event_id=actividad.gcal_event_id,
    )

MATERIALIZATION_CAP_DAYS = 365


async def materialize_series(
    db: AsyncSession,
    payload: ActividadCreate,
    serie_id: str,
    sefirot_ids: list[str],
    usuario_id: str,
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
            usuario_id=usuario_id,
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
    sefira_id: str
    text: str
    score: float

class EvaluationResponse(BaseModel):
    saved: bool = True

@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(
    request: EvaluationRequest,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """Guarda una reflexión libre del usuario sobre una sefirá.

    KSpace-AI ya NO evalúa estas reflexiones — la IA actúa solo sobre las
    respuestas a las preguntas guía (POST /ia/respuestas/evaluar). Esta
    entrada queda como nota personal con la auto-puntuación.
    """
    registro = RegistroDiario(
        sefira_id=request.sefira_id,
        reflexion_texto=request.text,
        puntuacion_usuario=int(round(request.score)),
        puntuacion_ia=None,
        usuario_id=user.id,
    )
    db.add(registro)
    await db.commit()
    return EvaluationResponse(saved=True)

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


class PreguntaConEstado(BaseModel):
    pregunta_id: str
    texto_pregunta: str
    ultima_respuesta: Optional[str] = None
    fecha_ultima: Optional[datetime] = None
    siguiente_disponible: Optional[date] = None
    bloqueada: bool = False
    dias_restantes: Optional[int] = None


class RegistroOut(BaseModel):
    id: str
    reflexion_texto: Optional[str] = None
    puntuacion_usuario: Optional[int] = None
    puntuacion_ia: Optional[int] = None
    fecha_registro: datetime


class SefiraResumen(BaseModel):
    sefira_id: str
    sefira_nombre: str
    preguntas_total: int
    preguntas_frescas: int
    preguntas_disponibles: int
    score_ia_promedio: Optional[float] = None
    score_ia_ultimos: list[int] = []
    ultima_reflexion_texto: Optional[str] = None
    ultima_reflexion_score: Optional[int] = None
    ultima_actividad: Optional[datetime] = None
    intensidad: float = 0.0
    actividades_total: int = 0


class MesBucket(BaseModel):
    mes: str
    score_usuario: Optional[float] = None
    score_ia: Optional[float] = None
    reflexiones: int = 0
    respuestas: int = 0
    actividades: int = 0


class SefiraEvolucion(BaseModel):
    sefira_id: str
    sefira_nombre: str
    meses: list[MesBucket]


class SemanaBucket(BaseModel):
    semana: int          # 1-based week index within the month (1..5)
    label: str           # "S1", "S2", ...
    desde: str           # ISO date "YYYY-MM-DD"
    hasta: str           # ISO date "YYYY-MM-DD" (inclusive)
    actividades: int


class SefiraSemanas(BaseModel):
    sefira_id: str
    sefira_nombre: str
    mes: str             # "YYYY-MM"
    score_usuario: Optional[float] = None
    score_ia: Optional[float] = None
    reflexiones: int
    respuestas: int
    actividades: int     # total in the month
    semanas: list[SemanaBucket]


def _months_back(today: datetime, count: int) -> list[str]:
    """Return YYYY-MM keys for the last `count` months, oldest first."""
    keys: list[str] = []
    year = today.year
    month = today.month
    for _ in range(count):
        keys.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return list(reversed(keys))

@app.get("/respuestas/{sefira_id}", response_model=list[PreguntaConEstado])
async def get_respuestas_estado(
    sefira_id: str,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    preguntas = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.sefira_id == sefira_id)
    )).scalars().all()

    today = datetime.utcnow()
    out: list[PreguntaConEstado] = []
    for p in preguntas:
        last = (await db.execute(
            select(RespuestaPregunta)
            .where(
                RespuestaPregunta.pregunta_id == p.id,
                RespuestaPregunta.usuario_id == user.id,
            )
            .order_by(RespuestaPregunta.fecha_registro.desc())
            .limit(1)
        )).scalars().first()

        if last is None:
            out.append(PreguntaConEstado(
                pregunta_id=p.id, texto_pregunta=p.texto_pregunta,
            ))
            continue

        last_dt = last.fecha_registro
        if last_dt.tzinfo is not None:
            last_dt = last_dt.astimezone(timezone.utc).replace(tzinfo=None)
        cooldown_days = PREMIUM_COOLDOWN_DAYS if user.is_premium else FREE_COOLDOWN_DAYS
        next_avail = last_dt + timedelta(days=cooldown_days)
        bloqueada = next_avail > today
        dias = max(0, (next_avail.date() - today.date()).days) if bloqueada else None
        out.append(PreguntaConEstado(
            pregunta_id=p.id,
            texto_pregunta=p.texto_pregunta,
            ultima_respuesta=last.respuesta_texto,
            fecha_ultima=last_dt,
            siguiente_disponible=next_avail.date() if bloqueada else None,
            bloqueada=bloqueada,
            dias_restantes=dias,
        ))
    return out


@app.get("/registros/{sefira_id}", response_model=list[RegistroOut])
async def get_registros(
    sefira_id: str,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    rows = (await db.execute(
        select(RegistroDiario)
        .where(
            RegistroDiario.sefira_id == sefira_id,
            RegistroDiario.usuario_id == user.id,
        )
        .order_by(RegistroDiario.fecha_registro.desc())
    )).scalars().all()
    return [
        RegistroOut(
            id=r.id, reflexion_texto=r.reflexion_texto,
            puntuacion_usuario=r.puntuacion_usuario,
            puntuacion_ia=r.puntuacion_ia, fecha_registro=r.fecha_registro,
        )
        for r in rows
    ]


class HistorialRespuestaSnapshot(BaseModel):
    pregunta_id: str
    texto_pregunta: str
    respuesta_texto: str
    fecha_respuesta: datetime


class HistorialSnapshot(BaseModel):
    registro: RegistroOut
    sefira_id: str
    sefira_nombre: str
    respuestas: list[HistorialRespuestaSnapshot]


@app.get("/espejo/registros/{registro_id}/snapshot", response_model=HistorialSnapshot)
async def get_registro_snapshot(
    registro_id: str,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """Devuelve el RegistroDiario + las respuestas a las preguntas guia de
    esa sefirá en el momento del registro: para cada pregunta, la respuesta
    más reciente del usuario que sea anterior o igual a la fecha del registro.
    """
    registro = (await db.execute(
        select(RegistroDiario).where(
            RegistroDiario.id == registro_id,
            RegistroDiario.usuario_id == user.id,
        )
    )).scalars().first()
    if registro is None:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    sefira = (await db.execute(
        select(Sefira).where(Sefira.id == registro.sefira_id)
    )).scalars().first()
    if sefira is None:
        raise HTTPException(status_code=404, detail="Sefirá no encontrada")

    preguntas = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.sefira_id == registro.sefira_id)
    )).scalars().all()

    respuestas: list[HistorialRespuestaSnapshot] = []
    for p in preguntas:
        ultima = (await db.execute(
            select(RespuestaPregunta)
            .where(
                RespuestaPregunta.pregunta_id == p.id,
                RespuestaPregunta.usuario_id == user.id,
                RespuestaPregunta.fecha_registro <= registro.fecha_registro,
            )
            .order_by(RespuestaPregunta.fecha_registro.desc())
            .limit(1)
        )).scalars().first()
        if ultima is None:
            continue
        respuestas.append(HistorialRespuestaSnapshot(
            pregunta_id=p.id,
            texto_pregunta=p.texto_pregunta,
            respuesta_texto=ultima.respuesta_texto,
            fecha_respuesta=ultima.fecha_registro,
        ))

    return HistorialSnapshot(
        registro=RegistroOut(
            id=registro.id,
            reflexion_texto=registro.reflexion_texto,
            puntuacion_usuario=registro.puntuacion_usuario,
            puntuacion_ia=registro.puntuacion_ia,
            fecha_registro=registro.fecha_registro,
        ),
        sefira_id=sefira.id,
        sefira_nombre=sefira.nombre,
        respuestas=respuestas,
    )


@app.get("/espejo/resumen", response_model=list[SefiraResumen])
async def espejo_resumen(
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    sefirot = (await db.execute(select(Sefira).order_by(Sefira.nombre))).scalars().all()
    today = datetime.utcnow()
    threshold = today - timedelta(days=30)

    out: list[SefiraResumen] = []
    for s in sefirot:
        preguntas = (await db.execute(
            select(PreguntaSefira.id).where(PreguntaSefira.sefira_id == s.id)
        )).scalars().all()
        total = len(preguntas)

        frescas = 0
        disponibles = 0
        for pid in preguntas:
            last = (await db.execute(
                select(RespuestaPregunta.fecha_registro)
                .where(
                    RespuestaPregunta.pregunta_id == pid,
                    RespuestaPregunta.usuario_id == user.id,
                )
                .order_by(RespuestaPregunta.fecha_registro.desc()).limit(1)
            )).scalars().first()
            if last is None:
                disponibles += 1
                continue
            if last.tzinfo is not None:
                last = last.astimezone(timezone.utc).replace(tzinfo=None)
            if last >= threshold:
                frescas += 1
            else:
                disponibles += 1

        regs = (await db.execute(
            select(RegistroDiario)
            .where(
                RegistroDiario.sefira_id == s.id,
                RegistroDiario.usuario_id == user.id,
            )
            .order_by(RegistroDiario.fecha_registro.desc())
        )).scalars().all()

        ia_scores = [r.puntuacion_ia for r in regs if r.puntuacion_ia is not None]
        # score_ia_promedio mantiene el nombre por compat con el front, pero
        # ahora devuelve el ÚLTIMO score IA (no el promedio histórico) para
        # ser consistente con el chip "IA" del modal "Tus respuestas". El
        # promedio histórico vive en /espejo/evolucion para tracking.
        score_promedio = float(ia_scores[0]) if ia_scores else None
        ultimos = [r.puntuacion_ia for r in regs[:8] if r.puntuacion_ia is not None][::-1]

        ultima = regs[0] if regs else None
        intensidad = (frescas / total) if total > 0 else 0.0

        actividades_total = (await db.execute(
            select(func.count())
            .select_from(Actividad)
            .join(ActividadSefira, ActividadSefira.actividad_id == Actividad.id)
            .where(
                Actividad.usuario_id == user.id,
                ActividadSefira.sefira_id == s.id,
            )
        )).scalar_one()

        out.append(SefiraResumen(
            sefira_id=s.id, sefira_nombre=s.nombre,
            preguntas_total=total, preguntas_frescas=frescas, preguntas_disponibles=disponibles,
            score_ia_promedio=score_promedio,
            score_ia_ultimos=ultimos,
            ultima_reflexion_texto=ultima.reflexion_texto if ultima else None,
            ultima_reflexion_score=ultima.puntuacion_ia if ultima else None,
            ultima_actividad=ultima.fecha_registro if ultima else None,
            intensidad=intensidad,
            actividades_total=actividades_total,
        ))
    return out


@app.get("/espejo/evolucion", response_model=list[SefiraEvolucion])
async def espejo_evolucion(
    meses: int = Query(12, ge=1, le=120),
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if not user.is_premium:
        meses = min(meses, FREE_HISTORICO_MONTHS)
    sefirot = (await db.execute(select(Sefira).order_by(Sefira.nombre))).scalars().all()
    today = datetime.utcnow()
    mes_keys = _months_back(today, meses)

    out: list[SefiraEvolucion] = []
    for s in sefirot:
        regs = (await db.execute(
            select(RegistroDiario).where(
                RegistroDiario.sefira_id == s.id,
                RegistroDiario.usuario_id == user.id,
            )
        )).scalars().all()

        respuestas_rows = (await db.execute(
            select(RespuestaPregunta.fecha_registro)
            .join(PreguntaSefira, PreguntaSefira.id == RespuestaPregunta.pregunta_id)
            .where(
                PreguntaSefira.sefira_id == s.id,
                RespuestaPregunta.usuario_id == user.id,
            )
        )).scalars().all()

        regs_por_mes: dict[str, list] = {}
        for r in regs:
            fecha = r.fecha_registro
            if fecha.tzinfo is not None:
                fecha = fecha.astimezone(timezone.utc).replace(tzinfo=None)
            key = f"{fecha.year:04d}-{fecha.month:02d}"
            regs_por_mes.setdefault(key, []).append(r)

        respuestas_por_mes: dict[str, int] = {}
        for fecha in respuestas_rows:
            if fecha.tzinfo is not None:
                fecha = fecha.astimezone(timezone.utc).replace(tzinfo=None)
            key = f"{fecha.year:04d}-{fecha.month:02d}"
            respuestas_por_mes[key] = respuestas_por_mes.get(key, 0) + 1

        # Conteo de actividades del calendario taggeadas con esta sefirá,
        # agrupadas por mes (basadas en Actividad.inicio).
        actividad_inicios = (await db.execute(
            select(Actividad.inicio)
            .join(ActividadSefira, ActividadSefira.actividad_id == Actividad.id)
            .where(
                ActividadSefira.sefira_id == s.id,
                Actividad.usuario_id == user.id,
            )
        )).scalars().all()

        actividades_por_mes: dict[str, int] = {}
        for fecha in actividad_inicios:
            if fecha.tzinfo is not None:
                fecha = fecha.astimezone(timezone.utc).replace(tzinfo=None)
            key = f"{fecha.year:04d}-{fecha.month:02d}"
            actividades_por_mes[key] = actividades_por_mes.get(key, 0) + 1

        buckets: list[MesBucket] = []
        for mes_key in mes_keys:
            month_regs = regs_por_mes.get(mes_key, [])
            usuarios = [r.puntuacion_usuario for r in month_regs if r.puntuacion_usuario is not None]
            ias = [r.puntuacion_ia for r in month_regs if r.puntuacion_ia is not None]
            buckets.append(MesBucket(
                mes=mes_key,
                score_usuario=round(sum(usuarios) / len(usuarios), 1) if usuarios else None,
                score_ia=round(sum(ias) / len(ias), 1) if ias else None,
                reflexiones=len(month_regs),
                respuestas=respuestas_por_mes.get(mes_key, 0),
                actividades=actividades_por_mes.get(mes_key, 0),
            ))

        out.append(SefiraEvolucion(
            sefira_id=s.id,
            sefira_nombre=s.nombre,
            meses=buckets,
        ))
    return out


@app.get("/espejo/evolucion/{sefira_id}/semanas", response_model=SefiraSemanas)
async def espejo_evolucion_semanas(
    sefira_id: str,
    mes: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """Per-week breakdown for one sefirá in a given month.

    Returns weekly activity counts (one bucket per ~7-day chunk of the
    month) plus the month-level score_usuario / score_ia averages, which
    the frontend renders as flat reference lines on top of the weekly
    actividades curve.
    """
    sefira = (await db.execute(
        select(Sefira).where(Sefira.id == sefira_id)
    )).scalars().first()
    if sefira is None:
        raise HTTPException(status_code=404, detail="Sefira no encontrada")

    try:
        anio, mes_num = (int(p) for p in mes.split("-"))
        mes_inicio = datetime(anio, mes_num, 1)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Mes inválido")

    if not user.is_premium:
        # 12 calendar months back, anchored to first-of-month
        now = datetime.utcnow()
        cutoff_year = now.year
        cutoff_month = now.month - FREE_HISTORICO_MONTHS
        while cutoff_month <= 0:
            cutoff_month += 12
            cutoff_year -= 1
        cutoff = datetime(cutoff_year, cutoff_month, 1)
        if mes_inicio < cutoff:
            raise HTTPException(
                status_code=402,
                detail={"error": "premium_required", "reason": "historico_premium"},
            )

    if mes_num == 12:
        mes_fin = datetime(anio + 1, 1, 1)
    else:
        mes_fin = datetime(anio, mes_num + 1, 1)
    dias_en_mes = (mes_fin - mes_inicio).days

    regs = (await db.execute(
        select(RegistroDiario).where(
            RegistroDiario.sefira_id == sefira_id,
            RegistroDiario.usuario_id == user.id,
        )
    )).scalars().all()

    respuestas_rows = (await db.execute(
        select(RespuestaPregunta.fecha_registro)
        .join(PreguntaSefira, PreguntaSefira.id == RespuestaPregunta.pregunta_id)
        .where(
            PreguntaSefira.sefira_id == sefira_id,
            RespuestaPregunta.usuario_id == user.id,
        )
    )).scalars().all()

    actividad_inicios = (await db.execute(
        select(Actividad.inicio)
        .join(ActividadSefira, ActividadSefira.actividad_id == Actividad.id)
        .where(
            ActividadSefira.sefira_id == sefira_id,
            Actividad.usuario_id == user.id,
        )
    )).scalars().all()

    def _in_month(fecha: datetime) -> bool:
        if fecha.tzinfo is not None:
            fecha = fecha.astimezone(timezone.utc).replace(tzinfo=None)
        return mes_inicio <= fecha < mes_fin

    month_regs = [r for r in regs if _in_month(r.fecha_registro)]
    usuarios = [r.puntuacion_usuario for r in month_regs if r.puntuacion_usuario is not None]
    ias = [r.puntuacion_ia for r in month_regs if r.puntuacion_ia is not None]

    respuestas_count = sum(1 for f in respuestas_rows if _in_month(f))

    # Bucket activities by (day-1) // 7 → 0..4
    n_buckets = (dias_en_mes + 6) // 7  # 4 or 5
    actividades_por_semana = [0] * n_buckets
    for fecha in actividad_inicios:
        if not _in_month(fecha):
            continue
        f = fecha
        if f.tzinfo is not None:
            f = f.astimezone(timezone.utc).replace(tzinfo=None)
        idx = (f.day - 1) // 7
        if idx >= n_buckets:
            idx = n_buckets - 1
        actividades_por_semana[idx] += 1

    semanas: list[SemanaBucket] = []
    for i in range(n_buckets):
        desde_dia = i * 7 + 1
        hasta_dia = min((i + 1) * 7, dias_en_mes)
        desde = mes_inicio.replace(day=desde_dia).date().isoformat()
        hasta = mes_inicio.replace(day=hasta_dia).date().isoformat()
        semanas.append(SemanaBucket(
            semana=i + 1,
            label=f"S{i + 1}",
            desde=desde,
            hasta=hasta,
            actividades=actividades_por_semana[i],
        ))

    return SefiraSemanas(
        sefira_id=sefira.id,
        sefira_nombre=sefira.nombre,
        mes=mes,
        score_usuario=round(sum(usuarios) / len(usuarios), 1) if usuarios else None,
        score_ia=round(sum(ias) / len(ias), 1) if ias else None,
        reflexiones=len(month_regs),
        respuestas=respuestas_count,
        actividades=sum(actividades_por_semana),
        semanas=semanas,
    )


class WeakSefiraOut(BaseModel):
    id: str
    nombre: str
    score: float


class LecturaResponse(BaseModel):
    status: str  # "weak" | "balanced" | "no_data" | "disabled"
    weak_sefirot: list[WeakSefiraOut]
    message: Optional[str] = None


@app.get("/ia/calendario/lectura", response_model=LecturaResponse)
async def ia_calendario_lectura(
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if not user.ksai_enabled:
        return LecturaResponse(
            status="disabled",
            weak_sefirot=[],
            message="Activá KSpace-AI en tu perfil para ver la lectura mensual.",
        )

    # Definir el rango del mes corriente (UTC).
    now = datetime.utcnow()
    mes_inicio = datetime(now.year, now.month, 1)
    if now.month == 12:
        mes_fin = datetime(now.year + 1, 1, 1)
    else:
        mes_fin = datetime(now.year, now.month + 1, 1)

    sefirot = (await db.execute(select(Sefira).order_by(Sefira.nombre))).scalars().all()
    regs = (await db.execute(
        select(RegistroDiario).where(
            RegistroDiario.usuario_id == user.id,
            RegistroDiario.fecha_registro >= mes_inicio,
            RegistroDiario.fecha_registro < mes_fin,
        )
    )).scalars().all()

    if not regs:
        return LecturaResponse(
            status="no_data",
            weak_sefirot=[],
            message="Aún sin reflexiones este mes. Cuando reflexiones, KSpace-AI empezará a leer tu árbol.",
        )

    # Promedio por sefirá: (user + ia) / 2 sobre las reflexiones del mes
    promedio_por_sefira: dict[str, float] = {}
    for s in sefirot:
        s_regs = [r for r in regs if r.sefira_id == s.id]
        if not s_regs:
            continue
        vals = []
        for r in s_regs:
            u_score = r.puntuacion_usuario
            i_score = r.puntuacion_ia
            if u_score is None and i_score is None:
                continue
            if u_score is None:
                vals.append(float(i_score))
            elif i_score is None:
                vals.append(float(u_score))
            else:
                vals.append((float(u_score) + float(i_score)) / 2.0)
        if vals:
            promedio_por_sefira[s.id] = sum(vals) / len(vals)

    weak: list[WeakSefiraOut] = []
    sefira_by_id = {s.id: s for s in sefirot}
    for sefira_id, prom in sorted(promedio_por_sefira.items(), key=lambda kv: kv[1]):
        if prom < 5.0:
            weak.append(WeakSefiraOut(
                id=sefira_id,
                nombre=sefira_by_id[sefira_id].nombre,
                score=round(prom, 1),
            ))

    if not weak:
        return LecturaResponse(
            status="balanced",
            weak_sefirot=[],
            message="Tu árbol está balanceado este mes.",
        )

    pairs = [(w.nombre, w.score) for w in weak]
    message = await kspace_ai.generate_calendar_reading(pairs)
    return LecturaResponse(status="weak", weak_sefirot=weak, message=message)


class FelicitacionRequest(BaseModel):
    actividad_id: str


class FelicitacionResponse(BaseModel):
    show: bool
    sefira_id: Optional[str] = None
    sefira_nombre: Optional[str] = None
    count: Optional[int] = None
    message: Optional[str] = None


@app.post("/ia/calendario/felicitacion", response_model=FelicitacionResponse)
async def ia_calendario_felicitacion(
    payload: FelicitacionRequest,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # 1. Buscar la actividad y verificar ownership
    act = (await db.execute(
        select(Actividad).where(
            Actividad.id == payload.actividad_id,
            Actividad.usuario_id == user.id,
        )
    )).scalars().first()
    if act is None:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    # 2. Sefirot taggeadas
    sefirot_ids = (await db.execute(
        select(ActividadSefira.sefira_id).where(ActividadSefira.actividad_id == act.id)
    )).scalars().all()
    if not sefirot_ids:
        return FelicitacionResponse(show=False)

    # 3. Rango del mes corriente (UTC)
    now = datetime.utcnow()
    mes_inicio = datetime(now.year, now.month, 1)
    if now.month == 12:
        mes_fin = datetime(now.year + 1, 1, 1)
    else:
        mes_fin = datetime(now.year, now.month + 1, 1)

    # 4. Promedio por sefirá taggeada → quedarse con la más floja con promedio < 5
    regs = (await db.execute(
        select(RegistroDiario).where(
            RegistroDiario.usuario_id == user.id,
            RegistroDiario.sefira_id.in_(sefirot_ids),
            RegistroDiario.fecha_registro >= mes_inicio,
            RegistroDiario.fecha_registro < mes_fin,
        )
    )).scalars().all()

    promedios: dict[str, float] = {}
    for sid in sefirot_ids:
        s_regs = [r for r in regs if r.sefira_id == sid]
        if not s_regs:
            continue
        vals = []
        for r in s_regs:
            u_s, i_s = r.puntuacion_usuario, r.puntuacion_ia
            if u_s is None and i_s is None:
                continue
            if u_s is None:
                vals.append(float(i_s))
            elif i_s is None:
                vals.append(float(u_s))
            else:
                vals.append((float(u_s) + float(i_s)) / 2.0)
        if vals:
            promedios[sid] = sum(vals) / len(vals)

    floja = None  # (sefira_id, promedio)
    for sid, prom in promedios.items():
        if prom < 5.0 and (floja is None or prom < floja[1]):
            floja = (sid, prom)

    if floja is None:
        return FelicitacionResponse(show=False)

    # 5. Contar actividades del mes para la sefirá elegida
    count = (await db.execute(
        select(func.count())
        .select_from(Actividad)
        .join(ActividadSefira, ActividadSefira.actividad_id == Actividad.id)
        .where(
            Actividad.usuario_id == user.id,
            ActividadSefira.sefira_id == floja[0],
            Actividad.inicio >= mes_inicio,
            Actividad.inicio < mes_fin,
        )
    )).scalar_one()

    # 6. Nombre de la sefirá + template
    sefira_obj = (await db.execute(
        select(Sefira).where(Sefira.id == floja[0])
    )).scalars().first()
    nombre = sefira_obj.nombre if sefira_obj else floja[0]

    actividad_palabra = "actividad" if count == 1 else "actividades"
    message = f"Bien, agregaste {count} {actividad_palabra} a tu {nombre}. Te lo agradecerá."

    return FelicitacionResponse(
        show=True,
        sefira_id=floja[0],
        sefira_nombre=nombre,
        count=count,
        message=message,
    )


class EvaluarRespuestasRequest(BaseModel):
    sefira_id: str


class EvaluarRespuestasResponse(BaseModel):
    ai_score: Optional[float] = None
    feedback: str


@app.post("/ia/respuestas/evaluar", response_model=EvaluarRespuestasResponse)
async def ia_respuestas_evaluar(
    payload: EvaluarRespuestasRequest,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if not user.ksai_enabled:
        return EvaluarRespuestasResponse(
            ai_score=None,
            feedback="KSpace-AI desactivado. Activalo en tu perfil.",
        )

    sefira = (await db.execute(
        select(Sefira).where(Sefira.id == payload.sefira_id)
    )).scalars().first()
    if sefira is None:
        raise HTTPException(status_code=404, detail="Sefira no encontrada")

    # Todas las preguntas de la sefirá
    preguntas = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.sefira_id == payload.sefira_id)
        .order_by(PreguntaSefira.fecha_creacion)
    )).scalars().all()

    # Para cada pregunta, la última respuesta del usuario (si existe).
    qas: list[tuple[str, str]] = []
    for p in preguntas:
        ultima = (await db.execute(
            select(RespuestaPregunta)
            .where(
                RespuestaPregunta.pregunta_id == p.id,
                RespuestaPregunta.usuario_id == user.id,
            )
            .order_by(RespuestaPregunta.fecha_registro.desc())
            .limit(1)
        )).scalars().first()
        if ultima is not None:
            qas.append((p.texto_pregunta, ultima.respuesta_texto))

    if not qas:
        raise HTTPException(
            status_code=400,
            detail="No hay respuestas para evaluar en esta sefirá.",
        )

    score, feedback = await kspace_ai.evaluate_question_answers(
        sefira_nombre=sefira.nombre,
        qas=qas,
    )

    if score is None:
        return EvaluarRespuestasResponse(
            ai_score=None,
            feedback="No pudimos evaluar tus respuestas en este momento.",
        )

    # Guardar como un RegistroDiario con puntuacion_ia.
    registro = RegistroDiario(
        usuario_id=user.id,
        sefira_id=payload.sefira_id,
        reflexion_texto=None,
        puntuacion_usuario=None,
        puntuacion_ia=int(round(score)),
    )
    db.add(registro)
    await db.commit()

    return EvaluarRespuestasResponse(ai_score=score, feedback=feedback)


@app.post("/respuestas")
async def save_respuesta(
    rep: RespuestaCreate,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    last = (await db.execute(
        select(RespuestaPregunta)
        .where(
            RespuestaPregunta.pregunta_id == rep.pregunta_id,
            RespuestaPregunta.usuario_id == user.id,
        )
        .order_by(RespuestaPregunta.fecha_registro.desc())
        .limit(1)
    )).scalars().first()

    if last is not None:
        last_dt = last.fecha_registro
        if last_dt.tzinfo is not None:
            last_dt = last_dt.astimezone(timezone.utc).replace(tzinfo=None)
        cooldown_days = PREMIUM_COOLDOWN_DAYS if user.is_premium else FREE_COOLDOWN_DAYS
        next_available = last_dt + timedelta(days=cooldown_days)
        if next_available > datetime.utcnow():
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "cooldown_active",
                    "reason": "respuesta_cooldown",
                    "next_available": next_available.date().isoformat(),
                },
            )

    nueva_res = RespuestaPregunta(
        pregunta_id=rep.pregunta_id,
        respuesta_texto=rep.respuesta_texto,
        usuario_id=user.id,
    )
    db.add(nueva_res)
    await db.commit()
    await db.refresh(nueva_res)
    return nueva_res


class RespuestaForzarRequest(BaseModel):
    respuesta_texto: str


@app.post("/respuestas/{pregunta_id}/forzar")
async def save_respuesta_forzar(
    pregunta_id: str,
    rep: RespuestaForzarRequest,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """Premium-only: crea una nueva RespuestaPregunta ignorando el cooldown.
    Permite al usuario reiniciar el ciclo de reflexión sobre una sefirá sin
    esperar los 7 días del cooldown premium. Las respuestas anteriores quedan
    intactas como histórico."""
    if not user.is_premium:
        raise HTTPException(
            status_code=402,
            detail={"error": "premium_required", "reason": "feature_premium_only"},
        )

    # Verificar que la pregunta existe
    pregunta = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.id == pregunta_id)
    )).scalars().first()
    if pregunta is None:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")

    nueva_res = RespuestaPregunta(
        pregunta_id=pregunta_id,
        respuesta_texto=rep.respuesta_texto,
        usuario_id=user.id,
    )
    db.add(nueva_res)
    await db.commit()
    await db.refresh(nueva_res)
    return nueva_res


@app.post("/respuestas/{pregunta_id}/duplicar")
async def duplicar_respuesta(
    pregunta_id: str,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """Premium-only: duplica la última respuesta del usuario para esa pregunta,
    creando una nueva entrada con fecha actual y mismo texto. Útil cuando el
    usuario quiere mantener su respuesta anterior pero iniciar un nuevo ciclo
    (típicamente para luego agregar una reflexión libre sin re-escribir las
    preguntas guía)."""
    if not user.is_premium:
        raise HTTPException(
            status_code=402,
            detail={"error": "premium_required", "reason": "feature_premium_only"},
        )

    last = (await db.execute(
        select(RespuestaPregunta)
        .where(
            RespuestaPregunta.pregunta_id == pregunta_id,
            RespuestaPregunta.usuario_id == user.id,
        )
        .order_by(RespuestaPregunta.fecha_registro.desc())
        .limit(1)
    )).scalars().first()

    if last is None:
        raise HTTPException(
            status_code=404,
            detail="No hay respuestas previas para duplicar en esta pregunta",
        )

    nueva_res = RespuestaPregunta(
        pregunta_id=pregunta_id,
        respuesta_texto=last.respuesta_texto,
        usuario_id=user.id,
    )
    db.add(nueva_res)
    await db.commit()
    await db.refresh(nueva_res)
    return nueva_res


async def ensure_series_materialized(db: AsyncSession, end: datetime, user_id: str) -> None:
    """For each open-ended series (no UNTIL/COUNT), materialize more instances
    if the series' last instance ends before `end`."""
    seeds = (await db.execute(
        select(Actividad).where(
            and_(
                Actividad.rrule.is_not(None),
                Actividad.serie_id.is_not(None),
                Actividad.usuario_id == user_id,
            )
        )
    )).scalars().all()

    extended = False
    for seed in seeds:
        rule_str = seed.rrule or ""
        if "UNTIL=" in rule_str or "COUNT=" in rule_str:
            continue

        last = (await db.execute(
            select(Actividad).where(Actividad.serie_id == seed.serie_id)
            .order_by(Actividad.inicio.desc()).limit(1)
        )).scalars().first()
        if not last or last.inicio >= end:
            continue

        sefirot_rows = (await db.execute(
            select(ActividadSefira.sefira_id).where(ActividadSefira.actividad_id == seed.id)
        )).scalars().all()

        synthetic_payload = ActividadCreate(
            titulo=seed.titulo,
            descripcion=seed.descripcion,
            inicio=seed.inicio,
            fin=seed.fin,
            sefirot_ids=list(sefirot_rows),
            rrule=rule_str,
        )

        new_window_start = last.inicio + timedelta(seconds=1)
        new_window_end = last.inicio + timedelta(days=MATERIALIZATION_CAP_DAYS)
        if new_window_end < end:
            new_window_end = end + timedelta(days=30)

        instancias = await materialize_series(
            db,
            synthetic_payload,
            seed.serie_id,
            list(sefirot_rows),
            usuario_id=seed.usuario_id,
            range_start=new_window_start,
            range_end=new_window_end,
        )
        if instancias:
            extended = True

    if extended:
        await db.commit()


@app.get("/actividades", response_model=list[ActividadOut])
async def list_actividades(
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if start and end:
        await ensure_series_materialized(db, normalize_datetime(end), user_id=user.id)

    query = select(Actividad).where(Actividad.usuario_id == user.id).order_by(Actividad.inicio)
    if start and end:
        start_dt = normalize_datetime(start)
        end_dt = normalize_datetime(end)
        query = query.where(and_(Actividad.inicio < end_dt, Actividad.fin > start_dt))

    result = await db.execute(query)
    actividades = result.scalars().all()
    return [await serialize_actividad(db, actividad) for actividad in actividades]


@app.get("/actividades/{actividad_id}", response_model=ActividadOut)
async def get_actividad(
    actividad_id: str,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    result = await db.execute(
        select(Actividad).where(
            Actividad.id == actividad_id,
            Actividad.usuario_id == user.id,
        )
    )
    actividad = result.scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    return await serialize_actividad(db, actividad)


@app.post("/actividades", response_model=list[ActividadOut])
async def create_actividad(
    payload: ActividadCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if payload.fin <= payload.inicio:
        raise HTTPException(status_code=422, detail="La fecha de fin debe ser mayor a la fecha de inicio")
    await validate_sefirot_ids(db, payload.sefirot_ids)

    # --- Premium gating: recurrencias son premium-only ---
    if not user.is_premium and payload.rrule:
        raise HTTPException(
            status_code=402,
            detail={"error": "premium_required", "reason": "recurrence_premium"},
        )

    # --- Premium gating: free users can have at most 10 active (pendiente) actividades ---
    if not user.is_premium:
        active_count = (await db.execute(
            select(func.count(Actividad.id)).where(
                Actividad.usuario_id == user.id,
                Actividad.estado == "pendiente",
            )
        )).scalar() or 0
        if active_count >= FREE_ACTIVIDAD_LIMIT:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "premium_required",
                    "reason": "actividad_limit",
                    "current": active_count,
                    "max": FREE_ACTIVIDAD_LIMIT,
                },
            )

    if payload.rrule:
        try:
            rrulestr(payload.rrule, dtstart=normalize_datetime(payload.inicio))
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=f"RRULE inválido: {exc}")

        serie_id = str(uuid.uuid4())
        instancias = await materialize_series(
            db, payload, serie_id, payload.sefirot_ids, usuario_id=user.id,
        )
        if not instancias:
            raise HTTPException(status_code=422, detail="El RRULE no genera ninguna ocurrencia")
        await db.commit()

        # Schedule sync for the series master + mark children skipped.
        if user.gcal_sync_enabled:
            from database import get_session_factory
            for actividad in instancias:
                if actividad.rrule:  # this is the master
                    background_tasks.add_task(
                        gcal_sync.push_actividad, get_session_factory(), user.id, actividad.id,
                    )
                else:
                    actividad.sync_status = "skipped"
            await db.commit()

        return [await serialize_actividad(db, a) for a in instancias]

    actividad = Actividad(
        titulo=payload.titulo.strip(),
        descripcion=(payload.descripcion or "").strip() or None,
        inicio=normalize_datetime(payload.inicio),
        fin=normalize_datetime(payload.fin),
        estado="pendiente",
        usuario_id=user.id,
    )
    db.add(actividad)
    await db.flush()

    for sefira_id in payload.sefirot_ids:
        db.add(ActividadSefira(actividad_id=actividad.id, sefira_id=sefira_id))

    await db.commit()
    await db.refresh(actividad)

    if user.gcal_sync_enabled:
        from database import get_session_factory
        background_tasks.add_task(
            gcal_sync.push_actividad, get_session_factory(), user.id, actividad.id,
        )

    return [await serialize_actividad(db, actividad)]


@app.put("/actividades/{actividad_id}", response_model=list[ActividadOut])
async def update_actividad(
    actividad_id: str,
    payload: ActividadCreate,
    background_tasks: BackgroundTasks,
    scope: str = Query("one", pattern="^(one|series)$"),
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if payload.fin <= payload.inicio:
        raise HTTPException(status_code=422, detail="La fecha de fin debe ser mayor a la fecha de inicio")
    await validate_sefirot_ids(db, payload.sefirot_ids)

    actividad = (await db.execute(
        select(Actividad).where(
            Actividad.id == actividad_id,
            Actividad.usuario_id == user.id,
        )
    )).scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    if scope == "one" or actividad.serie_id is None:
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

        if user.gcal_sync_enabled:
            from database import get_session_factory
            background_tasks.add_task(
                gcal_sync.update_actividad, get_session_factory(), user.id, actividad_id,
            )

        return [await serialize_actividad(db, actividad)]

    serie_id = actividad.serie_id
    rrule_to_use = payload.rrule or actividad.rrule
    if not rrule_to_use:
        raise HTTPException(status_code=422, detail="No se pudo determinar el RRULE de la serie")

    siblings = (await db.execute(
        select(Actividad).where(
            Actividad.serie_id == serie_id,
            Actividad.usuario_id == user.id,
        )
    )).scalars().all()
    sibling_ids = [a.id for a in siblings]
    # Capture old master's gcal_event_id before destruction.
    old_master_gcal_event_id = next(
        (a.gcal_event_id for a in siblings if a.rrule and a.gcal_event_id),
        None,
    )

    await db.execute(delete(ActividadSefira).where(ActividadSefira.actividad_id.in_(sibling_ids)))
    await db.execute(delete(Actividad).where(
        and_(Actividad.serie_id == serie_id, Actividad.usuario_id == user.id)
    ))
    await db.flush()

    series_payload = payload.model_copy(update={"rrule": rrule_to_use})
    instancias = await materialize_series(
        db, series_payload, serie_id, payload.sefirot_ids, usuario_id=user.id,
    )
    if not instancias:
        raise HTTPException(status_code=422, detail="El RRULE no genera ninguna ocurrencia")
    await db.commit()

    if user.gcal_sync_enabled:
        from database import get_session_factory
        if old_master_gcal_event_id:
            background_tasks.add_task(
                gcal_sync.delete_actividad, get_session_factory(), user.id, old_master_gcal_event_id,
            )
        new_master = next((a for a in instancias if a.rrule), None)
        if new_master:
            background_tasks.add_task(
                gcal_sync.push_actividad, get_session_factory(), user.id, new_master.id,
            )
        for a in instancias:
            if not a.rrule:
                a.sync_status = "skipped"
        await db.commit()

    return [await serialize_actividad(db, a) for a in instancias]


@app.delete("/actividades/{actividad_id}")
async def delete_actividad(
    actividad_id: str,
    background_tasks: BackgroundTasks,
    scope: str = Query("one", pattern="^(one|series)$"),
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    actividad = (await db.execute(
        select(Actividad).where(
            Actividad.id == actividad_id,
            Actividad.usuario_id == user.id,
        )
    )).scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    # Capture gcal_event_ids BEFORE deletion.
    event_ids_to_delete: list[str] = []
    if scope == "series" and actividad.serie_id is not None:
        siblings = (await db.execute(
            select(Actividad).where(
                Actividad.serie_id == actividad.serie_id,
                Actividad.usuario_id == user.id,
            )
        )).scalars().all()
        for s in siblings:
            if s.gcal_event_id and s.rrule:  # only the master has it
                event_ids_to_delete.append(s.gcal_event_id)
        sibling_ids = [s.id for s in siblings]

        await db.execute(delete(ActividadSefira).where(ActividadSefira.actividad_id.in_(sibling_ids)))
        await db.execute(delete(Actividad).where(
            and_(Actividad.serie_id == actividad.serie_id, Actividad.usuario_id == user.id)
        ))
    else:
        if actividad.gcal_event_id:
            event_ids_to_delete.append(actividad.gcal_event_id)
        await db.delete(actividad)

    await db.commit()

    if user.gcal_sync_enabled:
        from database import get_session_factory
        for eid in event_ids_to_delete:
            background_tasks.add_task(
                gcal_sync.delete_actividad, get_session_factory(), user.id, eid,
            )

    return {"message": "Actividad eliminada"}


@app.get("/energia/volumen-semanal", response_model=VolumenSemanalOut)
async def get_volumen_semanal(
    fecha: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
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
        .where(and_(
            Actividad.inicio < week_end_dt,
            Actividad.fin > week_start_dt,
            Actividad.usuario_id == user.id,
        ))
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


# ---------------------------------------------------------------- GCAL SYNC

GCAL_SCOPE = "https://www.googleapis.com/auth/calendar"


def _build_gcal_authorize_url(settings, state: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.gcal_redirect_uri,
        "response_type": "code",
        "scope": GCAL_SCOPE,
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


@app.get("/sync/google/authorize")
async def gcal_authorize(
    user: Usuario = Depends(get_current_user),
):
    settings = get_settings()
    if not settings.gcal_sync_configured:
        raise HTTPException(503, "Google Calendar sync is not configured on this server")
    if user.provider != "google":
        raise HTTPException(403, "Solo usuarios autenticados con Google pueden activar sync")

    # Embed user_id in the state so the callback can identify the user
    # (the callback is a redirect from Google and has no auth header).
    state = create_state_token(
        settings,
        purpose="gcal_sync_state",
        extra_claims={"user_id": user.id},
    )
    return {"url": _build_gcal_authorize_url(settings, state)}


@app.get("/sync/google/callback")
async def gcal_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """OAuth callback from Google. This route has NO auth header because it's
    a redirect from Google's domain — we identify the user via the user_id
    claim baked into the state JWT (which we signed in /authorize).
    """
    settings = get_settings()
    if not settings.gcal_sync_configured:
        raise HTTPException(503, "Google Calendar sync is not configured")

    if error:
        return RedirectResponse(f"{settings.frontend_url}/?sync=denied", status_code=303)
    if not code or not state:
        raise HTTPException(400, "Missing code or state")

    payload = verify_state_token(state, settings, "gcal_sync_state")
    if not payload or not payload.get("user_id"):
        raise HTTPException(400, "Invalid OAuth state")

    user_id = payload["user_id"]
    user = (await db.execute(select(Usuario).where(Usuario.id == user_id))).scalars().first()
    if not user or user.provider != "google":
        raise HTTPException(403)

    # Exchange code for tokens — must include refresh_token because we used access_type=offline.
    async with httpx.AsyncClient(timeout=10.0) as http:
        resp = await http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.gcal_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(400, f"Token exchange failed: {resp.text[:200]}")
        tokens = resp.json()

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            400,
            "Google did not return a refresh_token. Revoke access at "
            "myaccount.google.com/permissions and try again.",
        )

    try:
        await gcal_sync.enable_sync_for_user(db, user_id, refresh_token)
    except GcalError as exc:
        # Google API call failed during setup (e.g. Calendar API not enabled
        # in the Cloud project → 403). Don't 500 — send the user back to the
        # app with an error flag so the UI can show a clean message.
        logger.error("enable_sync_for_user failed for %s: %s", user_id, exc)
        return RedirectResponse(f"{settings.frontend_url}/?sync=error", status_code=303)

    # Kick off backfill in the background — the route returns before it completes.
    from database import get_session_factory
    asyncio.create_task(gcal_sync.backfill_user(get_session_factory(), user_id))

    return RedirectResponse(f"{settings.frontend_url}/?sync=connected", status_code=303)


@app.post("/sync/google/disconnect")
async def gcal_disconnect(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    if not settings.gcal_sync_configured:
        raise HTTPException(503)
    await gcal_sync.disable_sync_for_user(db, user.id)
    return {"ok": True}


class SyncErrorOut(BaseModel):
    at: str
    where: str
    message: str


class SyncStatusOut(BaseModel):
    enabled: bool
    calendar_name: Optional[str] = None
    last_sync_at: Optional[datetime] = None
    pending_count: int
    error_count: int
    recent_errors: list[SyncErrorOut] = []


@app.get("/sync/status", response_model=SyncStatusOut)
async def sync_status(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pending = (await db.execute(
        select(func.count(Actividad.id)).where(
            Actividad.usuario_id == user.id,
            Actividad.sync_status == "pending",
        )
    )).scalar() or 0
    errors = (await db.execute(
        select(func.count(Actividad.id)).where(
            Actividad.usuario_id == user.id,
            Actividad.sync_status == "error",
        )
    )).scalar() or 0
    last = (await db.execute(
        select(Actividad.fecha_actualizacion).where(
            Actividad.usuario_id == user.id,
            Actividad.sync_status == "synced",
        ).order_by(Actividad.fecha_actualizacion.desc()).limit(1)
    )).scalar()

    # In-memory ring buffer populated by gcal_sync when any Google call fails.
    # Reversed so the most recent error is first.
    recent = list(reversed(gcal_sync.get_recent_errors(user.id)))

    return SyncStatusOut(
        enabled=user.gcal_sync_enabled,
        calendar_name="Kabbalah Space" if user.gcal_sync_enabled else None,
        last_sync_at=last,
        pending_count=pending,
        error_count=errors,
        recent_errors=[SyncErrorOut(**e) for e in recent],
    )


@app.post("/sync/backfill")
async def sync_backfill(
    background_tasks: BackgroundTasks,
    user: Usuario = Depends(get_current_user),
):
    if not user.gcal_sync_enabled:
        raise HTTPException(400, "Sync not enabled")
    from database import get_session_factory
    background_tasks.add_task(gcal_sync.backfill_user, get_session_factory(), user.id)
    return {"ok": True, "scheduled": True}


@app.post("/actividades/{actividad_id}/retry-sync")
async def retry_actividad_sync(
    actividad_id: str,
    background_tasks: BackgroundTasks,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    actividad = (await db.execute(
        select(Actividad).where(Actividad.id == actividad_id, Actividad.usuario_id == user.id)
    )).scalars().first()
    if not actividad:
        raise HTTPException(404)
    if not user.gcal_sync_enabled:
        raise HTTPException(400, "Sync not enabled")

    actividad.sync_status = "pending"
    await db.commit()

    from database import get_session_factory
    if actividad.gcal_event_id:
        background_tasks.add_task(gcal_sync.update_actividad, get_session_factory(), user.id, actividad_id)
    else:
        background_tasks.add_task(gcal_sync.push_actividad, get_session_factory(), user.id, actividad_id)
    return {"ok": True}
