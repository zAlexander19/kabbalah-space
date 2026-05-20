"""Seed histórico (12 meses) para visualizar el módulo Mi Evolución.

Pobla, para el usuario xwalt19@gmail.com:
  - 1 a 4 RegistroDiario por sefirá por mes (reflexiones con score user + IA)
  - 0 a 3 RespuestaPregunta por sefirá por mes (si hay preguntas seed)
  - 2 a 8 Actividad por sefirá por mes (con tag ActividadSefira)

Los scores se generan con una "tendencia" (camino aleatorio suave) por
sefirá para que las líneas no se vean planas — empieza por algún valor
entre 4 y 8 y deriva ± por mes con un poco de ruido. La cantidad de
actividades también tiene una tendencia.

Idempotencia: borra todo el seed previo (rows con texto/titulo que
empieza con "[SEED]") antes de re-insertar.

Uso:
    cd backend
    venv/Scripts/python.exe scripts/seed_evolucion_demo.py
"""
from __future__ import annotations

import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

# Make `backend/` importable when running this script from its scripts/ subdir.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from config import get_settings
from models import (
    Actividad, ActividadSefira, PreguntaSefira, RegistroDiario,
    RespuestaPregunta, Sefira, Usuario,
)

SEED_MARK = "[SEED]"
TARGET_EMAIL = "xwalt19@gmail.com"
MONTHS_BACK = 12


def _first_of_month(today: datetime, months_back: int) -> datetime:
    y, m = today.year, today.month
    for _ in range(months_back):
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return datetime(y, m, 1)


def _months_iter(today: datetime, count: int):
    """Yield first-of-month datetimes from `count` months ago up to current."""
    start = _first_of_month(today, count - 1)
    cur = start
    while cur <= today:
        yield cur
        y, m = cur.year, cur.month
        m += 1
        if m == 13:
            m = 1
            y += 1
        cur = datetime(y, m, 1)


def _random_date_in_month(month_start: datetime) -> datetime:
    next_y = month_start.year + (1 if month_start.month == 12 else 0)
    next_m = 1 if month_start.month == 12 else month_start.month + 1
    next_month_start = datetime(next_y, next_m, 1)
    days_in_month = (next_month_start - month_start).days
    day = random.randint(0, days_in_month - 1)
    hour = random.randint(7, 22)
    minute = random.choice([0, 15, 30, 45])
    return month_start + timedelta(days=day, hours=hour, minutes=minute)


async def main():
    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False)
    SessionMaker = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionMaker() as db:
        user = (await db.execute(
            select(Usuario).where(Usuario.email == TARGET_EMAIL)
        )).scalars().first()
        if not user:
            print(f"USER NOT FOUND: {TARGET_EMAIL}")
            return
        print(f"user_id={user.id}")

        sefirot = (await db.execute(select(Sefira))).scalars().all()
        print(f"sefirot in DB: {len(sefirot)}")
        if not sefirot:
            print("No sefirot in DB — run seed_preguntas.py first.")
            return

        # ---------- Clean previous seed ----------
        prev_regs = (await db.execute(
            select(RegistroDiario).where(
                RegistroDiario.usuario_id == user.id,
                RegistroDiario.reflexion_texto.like(f"{SEED_MARK}%"),
            )
        )).scalars().all()
        for r in prev_regs:
            await db.delete(r)

        prev_resps = (await db.execute(
            select(RespuestaPregunta).where(
                RespuestaPregunta.usuario_id == user.id,
                RespuestaPregunta.respuesta_texto.like(f"{SEED_MARK}%"),
            )
        )).scalars().all()
        for r in prev_resps:
            await db.delete(r)

        prev_acts = (await db.execute(
            select(Actividad).where(
                Actividad.usuario_id == user.id,
                Actividad.titulo.like(f"{SEED_MARK}%"),
            )
        )).scalars().all()
        for a in prev_acts:
            tags = (await db.execute(
                select(ActividadSefira).where(ActividadSefira.actividad_id == a.id)
            )).scalars().all()
            for t in tags:
                await db.delete(t)
            await db.delete(a)
        await db.commit()
        print(f"cleaned previous seed: {len(prev_regs)} regs, "
              f"{len(prev_resps)} respuestas, {len(prev_acts)} actividades")

        # ---------- Generate ----------
        today = datetime.now(timezone.utc).replace(tzinfo=None)
        random.seed(42)

        # per-sefirá trend: initial score user/IA + initial activity count.
        # Updated each month via small random walk with bounds.
        trend: dict[str, dict] = {
            s.id: {
                "score_user": random.uniform(4.0, 8.0),
                "score_ia":   random.uniform(4.0, 8.0),
                "activities": random.randint(2, 6),
            }
            for s in sefirot
        }

        n_regs = 0
        n_resps = 0
        n_acts = 0
        sample_titles = [
            "Meditación de", "Lectura sobre", "Práctica de",
            "Caminata reflexiva", "Estudio profundo", "Diálogo interno",
            "Ejercicio físico", "Escritura libre", "Yoga",
        ]

        for s in sefirot:
            preguntas = (await db.execute(
                select(PreguntaSefira).where(PreguntaSefira.sefira_id == s.id).limit(3)
            )).scalars().all()

            for month_start in _months_iter(today, MONTHS_BACK):
                t = trend[s.id]
                t["score_user"] = max(1.0, min(10.0, t["score_user"] + random.uniform(-1.0, 1.0)))
                t["score_ia"]   = max(1.0, min(10.0, t["score_ia"]   + random.uniform(-1.0, 1.0)))
                t["activities"] = max(0,   min(15,   t["activities"] + random.randint(-2, 2)))

                n_reflex = random.randint(1, 4)
                for _ in range(n_reflex):
                    fecha = _random_date_in_month(month_start)
                    sc_u = max(1, min(10, int(round(t["score_user"] + random.uniform(-1.5, 1.5)))))
                    sc_i = max(1, min(10, int(round(t["score_ia"]   + random.uniform(-1.5, 1.5)))))
                    db.add(RegistroDiario(
                        usuario_id=user.id,
                        sefira_id=s.id,
                        reflexion_texto=f"{SEED_MARK} {s.nombre} — reflexión histórica demo.",
                        puntuacion_usuario=sc_u,
                        puntuacion_ia=sc_i,
                        fecha_registro=fecha,
                    ))
                    n_regs += 1

                if preguntas:
                    n_resp = random.randint(0, min(3, len(preguntas)))
                    for p in random.sample(list(preguntas), n_resp):
                        fecha = _random_date_in_month(month_start)
                        db.add(RespuestaPregunta(
                            usuario_id=user.id,
                            pregunta_id=p.id,
                            respuesta_texto=f"{SEED_MARK} respuesta histórica demo.",
                            fecha_registro=fecha,
                        ))
                        n_resps += 1

                n_act = max(0, min(15, t["activities"] + random.randint(-1, 2)))
                for _ in range(n_act):
                    inicio = _random_date_in_month(month_start)
                    fin = inicio + timedelta(minutes=random.choice([30, 45, 60, 90]))
                    title = f"{SEED_MARK} {random.choice(sample_titles)} {s.nombre}"
                    act = Actividad(
                        id=str(uuid.uuid4()),
                        usuario_id=user.id,
                        titulo=title,
                        descripcion=None,
                        inicio=inicio,
                        fin=fin,
                        estado="pendiente",
                        sync_status="pending",
                    )
                    db.add(act)
                    await db.flush()
                    db.add(ActividadSefira(actividad_id=act.id, sefira_id=s.id))
                    n_acts += 1

        await db.commit()
        print(f"\nseeded:\n  reflexiones={n_regs}\n  respuestas={n_resps}\n  actividades={n_acts}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
