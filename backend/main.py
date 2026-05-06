import asyncio
import random
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from dateutil.rrule import rrulestr
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from config import Settings, get_settings
from database import engine, Base, get_db
from models import Sefira, PreguntaSefira, RespuestaPregunta, RegistroDiario, Actividad, ActividadSefira, Usuario
from auth import (
    EmailCollisionError,
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

settings = get_settings()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    sefira_id: str
    text: str
    score: float

class EvaluationResponse(BaseModel):
    ai_score: float
    feedback: str

@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(
    request: EvaluationRequest,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    await asyncio.sleep(1)
    ai_score = min(10.0, max(1.0, request.score + random.choice([-1.5, -0.5, 0.0, 0.5, 1.5])))
    feedback = (
        f"Análisis del Espejo Cognitivo para {request.sefira}:\n"
        f"El texto '[...]' denota una energia particular que requirio un ajuste aurico."
    )

    registro = RegistroDiario(
        sefira_id=request.sefira_id,
        reflexion_texto=request.text,
        puntuacion_usuario=int(round(request.score)),
        puntuacion_ia=int(round(ai_score)),
        usuario_id=user.id,
    )
    db.add(registro)
    await db.commit()

    return EvaluationResponse(ai_score=ai_score, feedback=feedback)

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
    reflexion_texto: str
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


class MesBucket(BaseModel):
    mes: str
    score_usuario: Optional[float] = None
    score_ia: Optional[float] = None
    reflexiones: int = 0
    respuestas: int = 0


class SefiraEvolucion(BaseModel):
    sefira_id: str
    sefira_nombre: str
    meses: list[MesBucket]


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
        next_avail = last_dt + timedelta(days=30)
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
        score_promedio = round(sum(ia_scores) / len(ia_scores), 1) if ia_scores else None
        ultimos = [r.puntuacion_ia for r in regs[:8] if r.puntuacion_ia is not None][::-1]

        ultima = regs[0] if regs else None
        intensidad = (frescas / total) if total > 0 else 0.0

        out.append(SefiraResumen(
            sefira_id=s.id, sefira_nombre=s.nombre,
            preguntas_total=total, preguntas_frescas=frescas, preguntas_disponibles=disponibles,
            score_ia_promedio=score_promedio,
            score_ia_ultimos=ultimos,
            ultima_reflexion_texto=ultima.reflexion_texto if ultima else None,
            ultima_reflexion_score=ultima.puntuacion_ia if ultima else None,
            ultima_actividad=ultima.fecha_registro if ultima else None,
            intensidad=intensidad,
        ))
    return out


@app.get("/espejo/evolucion", response_model=list[SefiraEvolucion])
async def espejo_evolucion(
    meses: int = Query(12, ge=1, le=120),
    db: AsyncSession = Depends(get_db),
):
    sefirot = (await db.execute(select(Sefira).order_by(Sefira.nombre))).scalars().all()
    today = datetime.utcnow()
    mes_keys = _months_back(today, meses)

    out: list[SefiraEvolucion] = []
    for s in sefirot:
        regs = (await db.execute(
            select(RegistroDiario).where(RegistroDiario.sefira_id == s.id)
        )).scalars().all()

        respuestas_rows = (await db.execute(
            select(RespuestaPregunta.fecha_registro)
            .join(PreguntaSefira, PreguntaSefira.id == RespuestaPregunta.pregunta_id)
            .where(PreguntaSefira.sefira_id == s.id)
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
            ))

        out.append(SefiraEvolucion(
            sefira_id=s.id,
            sefira_nombre=s.nombre,
            meses=buckets,
        ))
    return out


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
        next_available = last_dt + timedelta(days=30)
        if next_available > datetime.utcnow():
            raise HTTPException(
                status_code=409,
                detail=f"Esta pregunta vuelve a estar disponible el {next_available.date().isoformat()}",
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


async def ensure_series_materialized(db: AsyncSession, end: datetime) -> None:
    """For each open-ended series (no UNTIL/COUNT), materialize more instances
    if the series' last instance ends before `end`."""
    seeds = (await db.execute(
        select(Actividad).where(
            and_(Actividad.rrule.is_not(None), Actividad.serie_id.is_not(None))
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
):
    if start and end:
        await ensure_series_materialized(db, normalize_datetime(end))

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


@app.post("/actividades", response_model=list[ActividadOut])
async def create_actividad(payload: ActividadCreate, db: AsyncSession = Depends(get_db)):
    if payload.fin <= payload.inicio:
        raise HTTPException(status_code=422, detail="La fecha de fin debe ser mayor a la fecha de inicio")
    await validate_sefirot_ids(db, payload.sefirot_ids)

    if payload.rrule:
        try:
            rrulestr(payload.rrule, dtstart=normalize_datetime(payload.inicio))
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=f"RRULE inválido: {exc}")

        serie_id = str(uuid.uuid4())
        instancias = await materialize_series(db, payload, serie_id, payload.sefirot_ids)
        if not instancias:
            raise HTTPException(status_code=422, detail="El RRULE no genera ninguna ocurrencia")
        await db.commit()
        return [await serialize_actividad(db, a) for a in instancias]

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
    return [await serialize_actividad(db, actividad)]


@app.put("/actividades/{actividad_id}", response_model=list[ActividadOut])
async def update_actividad(
    actividad_id: str,
    payload: ActividadCreate,
    scope: str = Query("one", pattern="^(one|series)$"),
    db: AsyncSession = Depends(get_db),
):
    if payload.fin <= payload.inicio:
        raise HTTPException(status_code=422, detail="La fecha de fin debe ser mayor a la fecha de inicio")
    await validate_sefirot_ids(db, payload.sefirot_ids)

    actividad = (await db.execute(
        select(Actividad).where(Actividad.id == actividad_id)
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
        return [await serialize_actividad(db, actividad)]

    serie_id = actividad.serie_id
    rrule_to_use = payload.rrule or actividad.rrule
    if not rrule_to_use:
        raise HTTPException(status_code=422, detail="No se pudo determinar el RRULE de la serie")

    siblings = (await db.execute(
        select(Actividad).where(Actividad.serie_id == serie_id)
    )).scalars().all()
    sibling_ids = [a.id for a in siblings]

    await db.execute(delete(ActividadSefira).where(ActividadSefira.actividad_id.in_(sibling_ids)))
    await db.execute(delete(Actividad).where(Actividad.serie_id == serie_id))
    await db.flush()

    series_payload = payload.model_copy(update={"rrule": rrule_to_use})
    instancias = await materialize_series(db, series_payload, serie_id, payload.sefirot_ids)
    if not instancias:
        raise HTTPException(status_code=422, detail="El RRULE no genera ninguna ocurrencia")
    await db.commit()
    return [await serialize_actividad(db, a) for a in instancias]


@app.delete("/actividades/{actividad_id}")
async def delete_actividad(
    actividad_id: str,
    scope: str = Query("one", pattern="^(one|series)$"),
    db: AsyncSession = Depends(get_db),
):
    actividad = (await db.execute(
        select(Actividad).where(Actividad.id == actividad_id)
    )).scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    if scope == "series" and actividad.serie_id is not None:
        siblings = (await db.execute(
            select(Actividad.id).where(Actividad.serie_id == actividad.serie_id)
        )).scalars().all()
        await db.execute(delete(ActividadSefira).where(ActividadSefira.actividad_id.in_(siblings)))
        await db.execute(delete(Actividad).where(Actividad.serie_id == actividad.serie_id))
    else:
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
