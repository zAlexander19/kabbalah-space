# Actividades recurrentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add RFC 5545 RRULE-based recurrence to activities (presets daily/weekly/monthly/weekdays + custom inline UI), with eager materialization (365-day cap + auto-extension) and a per-instance edit/delete scope modal ("solo esta" / "toda la serie").

**Architecture:** Backend adds two nullable columns (`serie_id`, `rrule`) to `actividades`. The first instance of a series carries the full RRULE; siblings only the `serie_id`. Frontend adds `RecurrencePicker` (custom inline, not modal-on-modal) + `RecurrenceScopeDialog` shown before opening the panel for any event with a `serie_id`. No new tables.

**Tech Stack:** FastAPI + SQLAlchemy async + SQLite (existing); `python-dateutil` (new). React 19 + TypeScript + Framer Motion (existing).

**Spec:** [docs/superpowers/specs/2026-04-25-actividades-recurrentes-design.md](../specs/2026-04-25-actividades-recurrentes-design.md)

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `backend/models.py` | Add `serie_id` + `rrule` columns to `Actividad` |
| Modify | `backend/main.py` | Pydantic models, materialize_series, POST/PUT/DELETE/GET endpoints |
| Run once | `backend/kabbalah.db` | `ALTER TABLE` to add columns to existing DB |
| Install | `backend/venv` | `pip install python-dateutil` |
| Create | `frontend/src/calendar/utils/rrule.ts` | buildRRule / parseRRule / describeRRule |
| Create | `frontend/src/calendar/components/RecurrencePicker.tsx` | Dropdown + inline custom UI |
| Create | `frontend/src/calendar/components/RecurrenceScopeDialog.tsx` | "Solo esta / Toda la serie" modal |
| Modify | `frontend/src/calendar/types.ts` | Add `serie_id`, `rrule` to `Activity` |
| Modify | `frontend/src/calendar/hooks/useActivities.ts` | List response, scope params |
| Modify | `frontend/src/calendar/components/ActivityForm.tsx` | Integrate picker, scope-aware disabled state |
| Modify | `frontend/src/calendar/components/ActivityPanel.tsx` | Pass scope through to form |
| Modify | `frontend/src/calendar/components/CalendarEvent.tsx` | Double border for recurring chips |
| Modify | `frontend/src/calendar/CalendarModule.tsx` | Scope dialog state, openEvent flow, scoped delete |

---

## Task 1: Backend schema + dependency

**Files:**
- Install: `backend/venv` (python-dateutil)
- Modify: `backend/models.py`
- Run once: SQL on `backend/kabbalah.db`

- [ ] **Step 1: Install python-dateutil**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/backend"
source venv/Scripts/activate
pip install python-dateutil
```

Expected: `Successfully installed python-dateutil-2.x.x` (or "already installed").

- [ ] **Step 2: Add columns to `Actividad` model in `backend/models.py`**

Find the `Actividad` class (around line 92) and add the two new columns right after `fecha_actualizacion`:

```python
class Actividad(Base):

    __tablename__ = "actividades"

    id = Column(String(36), primary_key=True, default=generate_uuid)

    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"))

    titulo = Column(String(200), nullable=False)

    descripcion = Column(Text)

    inicio = Column(DateTime(timezone=True), nullable=False)

    fin = Column(DateTime(timezone=True), nullable=False)

    estado = Column(String(20), nullable=False, default="pendiente")

    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    fecha_actualizacion = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    serie_id = Column(String(36), nullable=True, index=True)

    rrule = Column(String(500), nullable=True)
```

- [ ] **Step 3: Apply ALTER TABLE to existing DB**

`Base.metadata.create_all` on startup does NOT add columns to existing tables. Run the ALTER manually so the dev DB picks up the new columns.

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/backend"
python -c "import sqlite3; c = sqlite3.connect('kabbalah.db'); c.execute('ALTER TABLE actividades ADD COLUMN serie_id VARCHAR(36)'); c.execute('ALTER TABLE actividades ADD COLUMN rrule VARCHAR(500)'); c.execute('CREATE INDEX IF NOT EXISTS ix_actividades_serie_id ON actividades(serie_id)'); c.commit(); c.close(); print('OK')"
```

Expected: `OK`. If it errors with "duplicate column name", the ALTER was already applied — safe to ignore.

- [ ] **Step 4: Restart backend to pick up the new model**

If a backend is currently running, kill it and restart so the SQLAlchemy mapper rebuilds with the new columns.

- [ ] **Step 5: Smoke test — confirm columns exist**

```bash
curl -s "http://127.0.0.1:8000/actividades?start=2026-04-01T00:00:00Z&end=2026-05-01T00:00:00Z" | head -c 200
```

Expected: JSON list (possibly `[]`). If the request 500s, the model+DB are out of sync.

- [ ] **Step 6: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add backend/models.py
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(backend): add serie_id and rrule columns to actividades"
```

---

## Task 2: Backend — materialize_series helper + Pydantic models

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Update imports at top of `backend/main.py`**

Replace lines 1-14 with:

```python
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
```

- [ ] **Step 2: Update `ActividadCreate` and `ActividadOut` Pydantic models**

Find `ActividadCreate` (around line 63) and add `rrule`:

```python
class ActividadCreate(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    inicio: datetime
    fin: datetime
    sefirot_ids: list[str]
    rrule: Optional[str] = None
```

Find `ActividadOut` (around line 76) and add the two new fields:

```python
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
```

- [ ] **Step 3: Update `serialize_actividad` to include new fields**

Find `serialize_actividad` (around line 110) and update the return:

```python
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
```

- [ ] **Step 4: Add `materialize_series` helper**

Insert this function after `serialize_actividad`:

```python
MATERIALIZATION_CAP_DAYS = 365


async def materialize_series(
    db: AsyncSession,
    payload: ActividadCreate,
    serie_id: str,
    sefirot_ids: list[str],
    range_start: Optional[datetime] = None,
    range_end: Optional[datetime] = None,
) -> list[Actividad]:
    """Generate and persist instances of a recurring series.

    Only the FIRST persisted instance carries the full rrule string; siblings
    carry only the serie_id. The window is [range_start, range_end] when both
    provided; otherwise [base_start, base_start + 365 days].
    """
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
```

- [ ] **Step 5: Type check by running backend**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/backend"
source venv/Scripts/activate
python -c "import main; print('OK')"
```

Expected: `OK` (no exceptions, no import errors).

- [ ] **Step 6: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add backend/main.py
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(backend): add materialize_series helper + rrule fields in models"
```

---

## Task 3: Backend — POST /actividades returns list, supports rrule

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Replace `create_actividad` endpoint**

Find the existing `@app.post("/actividades", ...)` (around line 212) and replace the entire function with:

```python
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
```

- [ ] **Step 2: Smoke test single (non-recurring) creation**

With backend running:
```bash
curl -s -X POST http://127.0.0.1:8000/actividades \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Test puntual","inicio":"2026-04-26T10:00:00","fin":"2026-04-26T11:00:00","sefirot_ids":["jesed"]}' | head -c 200
```

Expected: JSON list with one element (was a single object before — this is the contract change).

- [ ] **Step 3: Smoke test recurring creation**

```bash
curl -s -X POST http://127.0.0.1:8000/actividades \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Test serie","inicio":"2026-04-27T10:00:00","fin":"2026-04-27T11:00:00","sefirot_ids":["bina"],"rrule":"FREQ=WEEKLY;BYDAY=MO;COUNT=4"}' | python -c "import sys,json; data=json.load(sys.stdin); print(f'{len(data)} instancias'); [print(a['inicio'], a['serie_id'][:8]) for a in data]"
```

Expected: `4 instancias` followed by 4 dates one week apart, all sharing the same serie_id prefix.

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add backend/main.py
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(backend): POST /actividades supports rrule and returns a list"
```

---

## Task 4: Backend — PUT /actividades/{id}?scope=one|series

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Replace `update_actividad` endpoint**

Find the existing `@app.put("/actividades/{actividad_id}", ...)` (around line 236) and replace with:

```python
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
```

- [ ] **Step 2: Smoke test PUT scope=one on a series instance**

Use the serie_id from Task 3 step 3 to get an instance ID, then:

```bash
# Replace <ID> with one of the series instance IDs returned
curl -s -X PUT "http://127.0.0.1:8000/actividades/<ID>?scope=one" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Solo esta cambiada","inicio":"2026-04-27T10:00:00","fin":"2026-04-27T11:00:00","sefirot_ids":["bina"]}' | head -c 200
```

Expected: list with one element, titulo "Solo esta cambiada". Other instances of the series unchanged (verify with GET).

- [ ] **Step 3: Smoke test PUT scope=series**

```bash
curl -s -X PUT "http://127.0.0.1:8000/actividades/<SAME_ID>?scope=series" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Toda la serie","inicio":"2026-04-27T11:00:00","fin":"2026-04-27T12:00:00","sefirot_ids":["bina","jesed"],"rrule":"FREQ=WEEKLY;BYDAY=MO;COUNT=4"}' | python -c "import sys,json; data=json.load(sys.stdin); print(f'{len(data)} regeneradas'); print(data[0]['titulo'])"
```

Expected: `4 regeneradas` and `Toda la serie`. The previous "Solo esta cambiada" is gone — series wipe is destructive by design.

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add backend/main.py
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(backend): PUT /actividades supports scope=one|series"
```

---

## Task 5: Backend — DELETE /actividades/{id}?scope=one|series + GET auto-extension

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Replace `delete_actividad` endpoint**

```python
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
```

- [ ] **Step 2: Add `ensure_series_materialized` helper**

Insert this function right before the `list_actividades` endpoint:

```python
async def ensure_series_materialized(db: AsyncSession, end: datetime) -> None:
    """For each open-ended series (no UNTIL/COUNT), materialize more instances
    if the series' last instance ends before `end`."""
    seeds = (await db.execute(
        select(Actividad).where(
            and_(Actividad.rrule.is_not(None), Actividad.serie_id.is_not(None))
        )
    )).scalars().all()

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

        duration = seed.fin - seed.inicio
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

        await materialize_series(
            db,
            synthetic_payload,
            seed.serie_id,
            list(sefirot_rows),
            range_start=new_window_start,
            range_end=new_window_end,
        )
        _ = duration  # silence unused; kept for clarity

    await db.flush()
```

- [ ] **Step 3: Update `list_actividades` to call ensure_series_materialized**

Find the existing `@app.get("/actividades", ...)` (around line 186) and replace with:

```python
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
```

- [ ] **Step 4: Smoke test DELETE scope=one and scope=series**

```bash
# Create a tiny series
curl -s -X POST http://127.0.0.1:8000/actividades \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Series del","inicio":"2026-05-01T10:00:00","fin":"2026-05-01T11:00:00","sefirot_ids":["hod"],"rrule":"FREQ=DAILY;COUNT=3"}' | python -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'])"
```

Take the printed ID and:

```bash
curl -s -X DELETE "http://127.0.0.1:8000/actividades/<ID>?scope=one"
# Then list to verify only that one is gone
```

Expected: only one instance deleted, two remain.

```bash
curl -s -X DELETE "http://127.0.0.1:8000/actividades/<REMAINING_ID>?scope=series"
```

Expected: all remaining siblings deleted.

- [ ] **Step 5: Smoke test infinite series + auto-extension**

```bash
# Create open-ended weekly
curl -s -X POST http://127.0.0.1:8000/actividades \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Sin fin","inicio":"2026-04-27T07:00:00","fin":"2026-04-27T08:00:00","sefirot_ids":["yesod"],"rrule":"FREQ=WEEKLY;BYDAY=MO"}' | python -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} instancias creadas')"
```

Expected: ~52 instancias. Now query a range a year and a half out:

```bash
curl -s "http://127.0.0.1:8000/actividades?start=2027-09-01T00:00:00&end=2027-12-01T00:00:00" | python -c "import sys,json; d=json.load(sys.stdin); rec=[a for a in d if a.get('serie_id')]; print(f'{len(rec)} instancias en sept-dic 2027')"
```

Expected: > 0 (auto-extension materialized more weeks beyond the initial 365).

- [ ] **Step 6: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add backend/main.py
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(backend): DELETE scope=one|series + auto-extend open-ended series on GET"
```

---

## Task 6: Frontend — types + RRULE utility

**Files:**
- Modify: `frontend/src/calendar/types.ts`
- Create: `frontend/src/calendar/utils/rrule.ts`

- [ ] **Step 1: Update `Activity` type in `frontend/src/calendar/types.ts`**

Add the two new optional fields:

```ts
export type Activity = {
  id: string;
  titulo: string;
  descripcion: string | null;
  inicio: string;
  fin: string;
  estado: string;
  sefirot: ActivitySefira[];
  serie_id?: string | null;
  rrule?: string | null;
};
```

- [ ] **Step 2: Create `frontend/src/calendar/utils/rrule.ts`**

```ts
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ByDay = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export type RRuleParts = {
  freq: Freq;
  interval?: number;
  byDay?: ByDay[];
  byMonthDay?: number;
  endsOn?: Date;
  count?: number;
};

const DAY_LABELS: Record<ByDay, string> = {
  MO: 'lunes', TU: 'martes', WE: 'miércoles', TH: 'jueves',
  FR: 'viernes', SA: 'sábados', SU: 'domingos',
};
const DAY_ORDER: ByDay[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const FREQ_LABEL: Record<Freq, { sg: string; pl: string }> = {
  DAILY: { sg: 'día', pl: 'días' },
  WEEKLY: { sg: 'semana', pl: 'semanas' },
  MONTHLY: { sg: 'mes', pl: 'meses' },
};

export function buildRRule(parts: RRuleParts): string {
  const segments: string[] = [`FREQ=${parts.freq}`];
  if (parts.interval && parts.interval > 1) segments.push(`INTERVAL=${parts.interval}`);
  if (parts.byDay && parts.byDay.length > 0) {
    const ordered = DAY_ORDER.filter(d => parts.byDay!.includes(d));
    segments.push(`BYDAY=${ordered.join(',')}`);
  }
  if (parts.byMonthDay) segments.push(`BYMONTHDAY=${parts.byMonthDay}`);
  if (parts.endsOn) {
    const u = parts.endsOn;
    const yyyy = u.getFullYear();
    const mm = String(u.getMonth() + 1).padStart(2, '0');
    const dd = String(u.getDate()).padStart(2, '0');
    segments.push(`UNTIL=${yyyy}${mm}${dd}T235959Z`);
  }
  if (parts.count) segments.push(`COUNT=${parts.count}`);
  return segments.join(';');
}

export function parseRRule(rrule: string): RRuleParts {
  const map: Record<string, string> = {};
  for (const seg of rrule.split(';')) {
    const [k, v] = seg.split('=');
    if (k && v) map[k.toUpperCase()] = v;
  }
  const out: RRuleParts = { freq: (map.FREQ as Freq) || 'WEEKLY' };
  if (map.INTERVAL) out.interval = parseInt(map.INTERVAL, 10);
  if (map.BYDAY) out.byDay = map.BYDAY.split(',') as ByDay[];
  if (map.BYMONTHDAY) out.byMonthDay = parseInt(map.BYMONTHDAY, 10);
  if (map.COUNT) out.count = parseInt(map.COUNT, 10);
  if (map.UNTIL) {
    const m = map.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) out.endsOn = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  }
  return out;
}

export function describeRRule(rrule: string, _startDate: Date): string {
  const p = parseRRule(rrule);
  const interval = p.interval && p.interval > 1 ? p.interval : 1;
  const unitLabel = interval === 1 ? FREQ_LABEL[p.freq].sg : FREQ_LABEL[p.freq].pl;
  let s = interval === 1 ? `Cada ${unitLabel}` : `Cada ${interval} ${unitLabel}`;

  if (p.freq === 'WEEKLY' && p.byDay && p.byDay.length > 0) {
    const labels = DAY_ORDER.filter(d => p.byDay!.includes(d)).map(d => DAY_LABELS[d]);
    s += ` los ${formatList(labels)}`;
  }
  if (p.freq === 'MONTHLY' && p.byMonthDay) {
    s += ` el día ${p.byMonthDay}`;
  }
  if (p.count) s += `, ${p.count} ${p.count === 1 ? 'vez' : 'veces'}`;
  else if (p.endsOn) s += `, hasta el ${format(p.endsOn, "d 'de' MMMM 'de' yyyy", { locale: es })}`;
  return s;
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export const WEEKDAY_FROM_DATE: Record<number, ByDay> = {
  0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA',
};
```

- [ ] **Step 3: Type check**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npx tsc -b --noEmit
```

Expected: no output (PASS).

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/types.ts frontend/src/calendar/utils/rrule.ts
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add Activity recurrence fields + RRULE utility"
```

---

## Task 7: Frontend — RecurrencePicker component

**Files:**
- Create: `frontend/src/calendar/components/RecurrencePicker.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useMemo, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  type ByDay, type Freq,
  buildRRule, parseRRule, describeRRule, WEEKDAY_FROM_DATE,
} from '../utils/rrule';

type Props = {
  value: string | null;
  startDate: Date;
  disabled?: boolean;
  onChange: (rrule: string | null) => void;
};

type EndsKind = 'never' | 'on' | 'after';

const DAYS_UI: { key: ByDay; label: string }[] = [
  { key: 'MO', label: 'L' }, { key: 'TU', label: 'M' }, { key: 'WE', label: 'M' },
  { key: 'TH', label: 'J' }, { key: 'FR', label: 'V' }, { key: 'SA', label: 'S' }, { key: 'SU', label: 'D' },
];

export default function RecurrencePicker({ value, startDate, disabled, onChange }: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const startWeekday = WEEKDAY_FROM_DATE[startDate.getDay()];
  const startDayOfMonth = startDate.getDate();
  const startWeekdayLabel = format(startDate, 'EEEE', { locale: es });

  const presets = useMemo(() => ([
    { id: 'none',    label: 'No se repite',                                               rrule: null },
    { id: 'daily',   label: 'Diariamente',                                                rrule: 'FREQ=DAILY' },
    { id: 'weekly',  label: `Semanalmente los ${startWeekdayLabel}s`,                      rrule: `FREQ=WEEKLY;BYDAY=${startWeekday}` },
    { id: 'wkdays',  label: 'Días de semana (L-V)',                                       rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
    { id: 'monthly', label: `Mensualmente el día ${startDayOfMonth}`,                      rrule: `FREQ=MONTHLY;BYMONTHDAY=${startDayOfMonth}` },
  ]), [startWeekday, startWeekdayLabel, startDayOfMonth]);

  const matchedPreset = presets.find(p => p.rrule === value);
  const selectedKey = matchedPreset ? matchedPreset.id : (value ? 'custom' : 'none');

  useEffect(() => {
    if (value && !matchedPreset) setShowCustom(true);
  }, [value, matchedPreset]);

  function onSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const key = e.target.value;
    if (key === 'custom') {
      setShowCustom(true);
      const initial = value && !matchedPreset ? value : `FREQ=WEEKLY;BYDAY=${startWeekday}`;
      onChange(initial);
      return;
    }
    setShowCustom(false);
    const preset = presets.find(p => p.id === key);
    onChange(preset?.rrule ?? null);
  }

  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Repetir</label>
      <select
        disabled={disabled}
        value={selectedKey}
        onChange={onSelect}
        className="mt-2 w-full bg-[#1b1f25] border border-stone-700/50 focus:border-amber-300/60 rounded-lg px-3 py-2 text-sm text-stone-100 outline-none disabled:opacity-50"
      >
        {presets.map(p => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
        <option value="custom">Personalizado…</option>
      </select>

      {showCustom && value && !disabled && (
        <CustomBlock value={value} startDate={startDate} onChange={onChange} />
      )}

      {value && (
        <p className="text-[11px] text-amber-200/80 mt-2 italic">
          {describeRRule(value, startDate)}
        </p>
      )}
      {disabled && (
        <p className="text-[10px] text-stone-500 mt-2">La recurrencia solo se modifica al editar “Toda la serie”.</p>
      )}
    </div>
  );
}

function CustomBlock({ value, startDate, onChange }: { value: string; startDate: Date; onChange: (r: string) => void }) {
  const parts = parseRRule(value);
  const [interval, setInterval] = useState(parts.interval ?? 1);
  const [freq, setFreq] = useState<Freq>(parts.freq);
  const [byDay, setByDay] = useState<ByDay[]>(parts.byDay ?? [WEEKDAY_FROM_DATE[startDate.getDay()]]);
  const [endsKind, setEndsKind] = useState<EndsKind>(parts.endsOn ? 'on' : parts.count ? 'after' : 'never');
  const [endsOn, setEndsOn] = useState<string>(
    parts.endsOn ? format(parts.endsOn, 'yyyy-MM-dd') : format(new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate()), 'yyyy-MM-dd')
  );
  const [count, setCount] = useState(parts.count ?? 8);

  useEffect(() => {
    const opts: Parameters<typeof buildRRule>[0] = { freq };
    if (interval > 1) opts.interval = interval;
    if (freq === 'WEEKLY') opts.byDay = byDay;
    if (freq === 'MONTHLY') opts.byMonthDay = startDate.getDate();
    if (endsKind === 'on') {
      const [yy, mm, dd] = endsOn.split('-').map(n => parseInt(n, 10));
      opts.endsOn = new Date(yy, mm - 1, dd);
    } else if (endsKind === 'after') {
      opts.count = count;
    }
    onChange(buildRRule(opts));
  }, [freq, interval, byDay, endsKind, endsOn, count, startDate, onChange]);

  function toggleDay(d: ByDay) {
    setByDay(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  return (
    <div className="mt-3 p-3 rounded-lg border border-stone-700/40 bg-stone-950/40 space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-stone-400">Cada</span>
        <input
          type="number" min={1} max={99} value={interval}
          onChange={e => setInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-14 bg-[#1b1f25] border border-stone-700/50 rounded-md px-2 py-1 text-stone-100"
        />
        <select
          value={freq}
          onChange={e => setFreq(e.target.value as Freq)}
          className="bg-[#1b1f25] border border-stone-700/50 rounded-md px-2 py-1 text-stone-100"
        >
          <option value="DAILY">{interval === 1 ? 'día' : 'días'}</option>
          <option value="WEEKLY">{interval === 1 ? 'semana' : 'semanas'}</option>
          <option value="MONTHLY">{interval === 1 ? 'mes' : 'meses'}</option>
        </select>
      </div>

      {freq === 'WEEKLY' && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400 mb-2">Repetir en</p>
          <div className="flex gap-1">
            {DAYS_UI.map(d => (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleDay(d.key)}
                className="w-7 h-7 rounded-full text-[11px] font-semibold transition-colors"
                style={{
                  background: byDay.includes(d.key) ? '#e9c349' : 'transparent',
                  color: byDay.includes(d.key) ? '#1c1917' : '#a8a29e',
                  border: '1px solid rgba(120,120,120,0.4)',
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400 mb-2">Termina</p>
        <div className="space-y-2 text-xs text-stone-300">
          <label className="flex items-center gap-2">
            <input type="radio" name="ends" checked={endsKind === 'never'} onChange={() => setEndsKind('never')} />
            Nunca
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="ends" checked={endsKind === 'on'} onChange={() => setEndsKind('on')} />
            El
            <input
              type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} disabled={endsKind !== 'on'}
              className="bg-[#1b1f25] border border-stone-700/50 rounded-md px-2 py-1 text-stone-100 disabled:opacity-40"
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="ends" checked={endsKind === 'after'} onChange={() => setEndsKind('after')} />
            Tras
            <input
              type="number" min={1} max={500} value={count}
              onChange={e => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              disabled={endsKind !== 'after'}
              className="w-14 bg-[#1b1f25] border border-stone-700/50 rounded-md px-2 py-1 text-stone-100 disabled:opacity-40"
            />
            veces
          </label>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npx tsc -b --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/components/RecurrencePicker.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add RecurrencePicker with presets + inline custom UI"
```

---

## Task 8: Frontend — RecurrenceScopeDialog component

**Files:**
- Create: `frontend/src/calendar/components/RecurrenceScopeDialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type Scope = 'one' | 'series';
type Mode = 'edit' | 'delete';

type Props = {
  open: boolean;
  mode: Mode;
  onChoose: (scope: Scope) => void;
  onCancel: () => void;
};

export default function RecurrenceScopeDialog({ open, mode, onChoose, onCancel }: Props) {
  const [scope, setScope] = useState<Scope>('one');

  useEffect(() => { if (open) setScope('one'); }, [open]);

  const verb = mode === 'edit' ? 'Editar' : 'Borrar';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scope-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onCancel}
            className="fixed inset-0 z-[80] bg-[#0a0a0c]/85 backdrop-blur-md"
          />
          <motion.div
            key="scope-card"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-1/2 left-1/2 z-[81] -translate-x-1/2 -translate-y-1/2 w-[min(420px,90vw)] bg-[#15181d] border border-stone-700/50 rounded-2xl p-6 shadow-2xl"
            style={{ willChange: 'transform' }}
          >
            <h4 className="font-serif text-xl text-amber-100/90 mb-1">{verb} actividad</h4>
            <p className="text-xs text-stone-400 mb-5">Esta actividad pertenece a una serie recurrente.</p>

            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-stone-700/50 hover:bg-stone-800/40 cursor-pointer">
                <input
                  type="radio"
                  name="rec-scope"
                  checked={scope === 'one'}
                  onChange={() => setScope('one')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm text-stone-100">Solo esta</p>
                  <p className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">Las demás del patrón quedan iguales</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-stone-700/50 hover:bg-stone-800/40 cursor-pointer">
                <input
                  type="radio"
                  name="rec-scope"
                  checked={scope === 'series'}
                  onChange={() => setScope('series')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm text-stone-100">Toda la serie</p>
                  <p className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">{mode === 'edit' ? 'Regenera todas las instancias' : 'Borra todas las instancias'}</p>
                </div>
              </label>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border border-stone-700 text-stone-300 text-xs uppercase tracking-[0.14em] py-2.5 hover:bg-stone-800/60 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => onChoose(scope)}
                className="flex-1 rounded-xl bg-amber-300 text-stone-900 font-semibold text-xs uppercase tracking-[0.18em] py-2.5 hover:bg-amber-200 transition-colors"
              >
                Continuar
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/components/RecurrenceScopeDialog.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add RecurrenceScopeDialog (Solo esta / Toda la serie)"
```

---

## Task 9: Frontend — useActivities supports list response + scope params

**Files:**
- Modify: `frontend/src/calendar/hooks/useActivities.ts`

- [ ] **Step 1: No changes needed in `useActivities` itself** — the hook only does GET. The mutating endpoints are called directly from `ActivityForm` and `CalendarModule`, which are updated in the next tasks. The GET response shape is unchanged. **Skip directly to Task 10.**

(This task exists in the plan as a checkpoint; nothing to do.)

---

## Task 10: Frontend — ActivityForm integrates picker + sends rrule + scope-aware

**Files:**
- Modify: `frontend/src/calendar/components/ActivityForm.tsx`

- [ ] **Step 1: Add `scope` and `rrule` to the form**

Replace the props type and component body. The full updated file:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { SefiraNode, Activity } from '../types';
import { SEFIRA_COLORS, API_BASE } from '../tokens';
import RecurrencePicker from './RecurrencePicker';

type Scope = 'one' | 'series';

type Props = {
  sefirot: SefiraNode[];
  editing: Activity | null;
  initialDate?: Date;
  initialSlot?: { start: Date; end: Date } | null;
  scope?: Scope;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted?: () => void;
  onRequestDeleteScope?: () => void;
};

function ymd(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
function hm(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

export default function ActivityForm({
  sefirot, editing, initialDate, initialSlot, scope = 'one',
  onSaved, onCancel, onDeleted, onRequestDeleteScope,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => ymd(initialDate ?? new Date()));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [selected, setSelected] = useState<string[]>([]);
  const [rrule, setRrule] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<number | null>(null);

  useEffect(() => {
    if (editing) {
      const s = new Date(editing.inicio);
      const e = new Date(editing.fin);
      setTitle(editing.titulo);
      setDescription(editing.descripcion ?? '');
      setDate(ymd(s));
      setStartTime(hm(s));
      setEndTime(hm(e));
      setSelected(editing.sefirot.map(x => x.id));
      setRrule(editing.rrule ?? null);
    } else if (initialSlot) {
      setDate(ymd(initialSlot.start));
      setStartTime(hm(initialSlot.start));
      setEndTime(hm(initialSlot.end));
      setTitle('');
      setDescription('');
      setSelected([]);
      setRrule(null);
    } else if (initialDate) {
      setDate(ymd(initialDate));
    }
    setError('');
    setConfirmDelete(false);
  }, [editing, initialDate, initialSlot]);

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) {
      setError('Debes seleccionar al menos una sefirá');
      setShake(s => s + 1);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const startIso = new Date(`${date}T${startTime}:00`).toISOString();
      const endIso   = new Date(`${date}T${endTime}:00`).toISOString();
      const payload = {
        titulo: title,
        descripcion: description,
        inicio: startIso,
        fin: endIso,
        sefirot_ids: selected,
        rrule: rrule || undefined,
      };
      const url = editing
        ? `${API_BASE}/actividades/${editing.id}?scope=${scope}`
        : `${API_BASE}/actividades`;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'No se pudo guardar' }));
        setError(data.detail ?? 'No se pudo guardar');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteClick() {
    if (!editing) return;
    if (editing.serie_id && onRequestDeleteScope) {
      onRequestDeleteScope();
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    void doDelete();
  }

  async function doDelete() {
    if (!editing) return;
    const res = await fetch(`${API_BASE}/actividades/${editing.id}?scope=${scope}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('No se pudo eliminar');
      return;
    }
    onDeleted?.();
  }

  const inputBase = "w-full bg-transparent border-0 border-b border-stone-700/50 focus:border-b-2 focus:border-amber-300/70 focus:outline-none text-sm text-stone-100 px-0 py-2 transition-colors";

  const startDateForPicker = (() => {
    const [yy, mm, dd] = date.split('-').map(n => parseInt(n, 10));
    if (!yy || !mm || !dd) return new Date();
    return new Date(yy, mm - 1, dd);
  })();

  return (
    <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-6 space-y-6">
      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Título</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Ej. Meditación de Jésed" className={inputBase} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[0.4fr_0.6fr] gap-4">
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Fecha</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inputBase} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Horas</label>
          <div className="grid grid-cols-2 gap-3">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required className={inputBase} />
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required className={inputBase} />
          </div>
        </div>
      </div>

      <RecurrencePicker
        value={rrule}
        startDate={startDateForPicker}
        disabled={!!editing && scope === 'one' && !!editing.serie_id}
        onChange={setRrule}
      />

      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Descripción</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Intención y foco energético..." className="w-full min-h-[100px] resize-y bg-[#1b1f25] border border-stone-700/50 focus:border-amber-300/60 focus:outline-none text-sm text-stone-100 rounded-lg px-3 py-2 mt-2 transition-colors" />
      </div>

      <div className={shake ? 'cal-shake' : ''} key={shake}>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Sefirot</label>
        <div className="mt-3 flex flex-wrap gap-2">
          {sefirot.map(s => {
            const active = selected.includes(s.id);
            const color = SEFIRA_COLORS[s.id] ?? '#a3a3a3';
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider border transition active:scale-[1.08]"
                style={{
                  borderColor: active ? color : 'rgba(120,120,120,0.4)',
                  background: active ? `${color}26` : 'rgba(38,42,50,0.8)',
                  color: active ? '#f5f5f5' : '#b7bac1',
                  transitionDuration: '0.18s',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-red-400 text-xs cal-fade-in">{error}</p>}

      <div className="flex flex-col gap-3 pt-2">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-amber-300 text-stone-900 font-semibold text-xs uppercase tracking-[0.18em] py-3 hover:bg-amber-200 disabled:opacity-60 transition-colors"
          >
            {saving ? <LoadingDots /> : (editing ? 'Guardar cambios' : 'Crear actividad')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-stone-700 text-stone-300 text-xs uppercase tracking-[0.14em] px-4 hover:bg-stone-800/60 transition-colors"
          >
            Cancelar
          </button>
        </div>
        {editing && (
          <button
            type="button"
            onClick={handleDeleteClick}
            className={`w-full rounded-xl font-semibold text-[10px] uppercase tracking-[0.18em] py-3 border transition-colors ${
              confirmDelete
                ? 'bg-red-500 text-stone-900 border-red-500'
                : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
            }`}
          >
            {editing.serie_id ? 'Borrar actividad…' : (confirmDelete ? 'Click otra vez para confirmar' : 'Borrar actividad')}
          </button>
        )}
      </div>
    </form>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-stone-900 cal-loading-dot"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

Expected: no output (some errors may appear because `ActivityPanel` doesn't pass `scope` yet — fixed in Task 11).

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/components/ActivityForm.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): integrate RecurrencePicker into ActivityForm with scope-aware behavior"
```

---

## Task 11: Frontend — ActivityPanel passes scope through

**Files:**
- Modify: `frontend/src/calendar/components/ActivityPanel.tsx`

- [ ] **Step 1: Add scope prop and forward it**

Update the entire file:

```tsx
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { SefiraNode, Activity } from '../types';
import { panelSpring, panelExit } from '../motion/transitions';
import ActivityForm from './ActivityForm';

type Scope = 'one' | 'series';

type Props = {
  open: boolean;
  sefirot: SefiraNode[];
  editing: Activity | null;
  initialSlot: { start: Date; end: Date } | null;
  scope: Scope;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onRequestDeleteScope?: () => void;
};

export default function ActivityPanel({
  open, sefirot, editing, initialSlot, scope, onClose, onSaved, onDeleted, onRequestDeleteScope,
}: Props) {
  const [mountForm, setMountForm] = useState(false);

  useEffect(() => {
    if (!open) {
      setMountForm(false);
      return;
    }
    const f1 = requestAnimationFrame(() => {
      const f2 = requestAnimationFrame(() => setMountForm(true));
      (window as unknown as { __panelFormFrame?: number }).__panelFormFrame = f2;
    });
    return () => {
      cancelAnimationFrame(f1);
      const f2 = (window as unknown as { __panelFormFrame?: number }).__panelFormFrame;
      if (f2) cancelAnimationFrame(f2);
    };
  }, [open]);

  const headerTitle = editing
    ? (scope === 'series' ? 'Editar toda la serie' : 'Editar actividad')
    : 'Crear actividad';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-[#0a0a0c]/80 backdrop-blur-md"
          />
          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%', transition: panelExit }}
            transition={panelSpring}
            style={{ willChange: 'transform' }}
            className="fixed right-0 top-0 z-[70] h-full w-full max-w-[460px] bg-[#15181d] border-l border-stone-700/45 shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col"
          >
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(233,195,73,0.15)' }}>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400">Gestor de actividad</p>
                <h4 className="font-serif text-2xl mt-1 text-amber-100/90">{headerTitle}</h4>
              </div>
              <motion.button
                type="button"
                onClick={onClose}
                whileHover={{ rotate: 90 }}
                transition={{ duration: 0.22 }}
                className="w-9 h-9 rounded-full border border-stone-700 text-stone-300 hover:bg-stone-800/60 flex items-center justify-center"
                aria-label="Cerrar"
              >
                <X size={16} />
              </motion.button>
            </div>

            {mountForm ? (
              <ActivityForm
                sefirot={sefirot}
                editing={editing}
                initialSlot={initialSlot}
                scope={scope}
                onSaved={onSaved}
                onCancel={onClose}
                onDeleted={onDeleted}
                onRequestDeleteScope={onRequestDeleteScope}
              />
            ) : (
              <div className="flex-1" />
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

Expected: errors in `CalendarModule.tsx` (it doesn't pass `scope` yet) — fixed in Task 12.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/components/ActivityPanel.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): ActivityPanel forwards scope and delete-scope hook to form"
```

---

## Task 12: Frontend — CalendarModule wires scope dialog + scoped delete

**Files:**
- Modify: `frontend/src/calendar/CalendarModule.tsx`

- [ ] **Step 1: Replace the entire `CalendarModule.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { startOfMonth } from 'date-fns';
import type { SefiraNode, Activity } from './types';
import { useCalendarRange } from './hooks/useCalendarRange';
import { useActivities } from './hooks/useActivities';
import { API_BASE } from './tokens';
import CalendarToolbar from './components/CalendarToolbar';
import WeekView from './views/WeekView';
import MonthView from './views/MonthView';
import YearView from './views/YearView';
import ViewMorph from './views/ViewMorph';
import SefirotTree from './components/SefirotTree';
import SefirotLegend from './components/SefirotLegend';
import ActivityPanel from './components/ActivityPanel';
import RecurrenceScopeDialog from './components/RecurrenceScopeDialog';

type Scope = 'one' | 'series';
type ScopePending = { activity: Activity; mode: 'edit' | 'delete' } | null;

type Props = {
  sefirot: SefiraNode[];
  glowText: string;
};

export default function CalendarModule({ sefirot, glowText }: Props) {
  const { anchor, setAnchor, view, setView, range, goPrev, goNext, goToday } = useCalendarRange();
  const { activities, volume, loading, error, reload } = useActivities(range);

  const [filterId, setFilterId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [pendingSlot, setPendingSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [scope, setScope] = useState<Scope>('one');
  const [scopeDialog, setScopeDialog] = useState<ScopePending>(null);

  const filteredActivities = useMemo(() => {
    if (!filterId) return activities;
    return activities.filter(a => a.sefirot.some(s => s.id === filterId));
  }, [activities, filterId]);

  function openCreate() {
    setEditing(null);
    setPendingSlot(null);
    setScope('one');
    setPanelOpen(true);
  }

  function openSlot(start: Date, end: Date) {
    const overlap = activities.find(a => new Date(a.inicio) < end && new Date(a.fin) > start);
    if (overlap) {
      openEvent(overlap);
      return;
    }
    setEditing(null);
    setPendingSlot({ start, end });
    setScope('one');
    setPanelOpen(true);
  }

  function openDay(day: Date) {
    setAnchor(day);
    setView('semana');
  }

  function openMonth(monthDate: Date) {
    setAnchor(startOfMonth(monthDate));
    setView('mes');
  }

  function openEvent(a: Activity) {
    if (a.serie_id) {
      setScopeDialog({ activity: a, mode: 'edit' });
      return;
    }
    setEditing(a);
    setPendingSlot(null);
    setScope('one');
    setPanelOpen(true);
  }

  function handleScopeChosen(chosenScope: Scope) {
    if (!scopeDialog) return;
    const { activity, mode } = scopeDialog;
    setScopeDialog(null);
    if (mode === 'edit') {
      setEditing(activity);
      setPendingSlot(null);
      setScope(chosenScope);
      setPanelOpen(true);
    } else {
      void deleteWithScope(activity.id, chosenScope);
    }
  }

  async function deleteWithScope(id: string, chosenScope: Scope) {
    const res = await fetch(`${API_BASE}/actividades/${id}?scope=${chosenScope}`, { method: 'DELETE' });
    if (res.ok) {
      setPanelOpen(false);
      reload();
    }
  }

  function requestDeleteScopeFromForm() {
    if (!editing) return;
    setPanelOpen(false);
    setScopeDialog({ activity: editing, mode: 'delete' });
  }

  function toggleFilter(id: string) {
    setFilterId(prev => prev === id ? null : id);
  }

  function handleSaved() {
    setPanelOpen(false);
    reload();
  }

  function handleDeleted() {
    setPanelOpen(false);
    reload();
  }

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
      <div className={`lg:col-span-7 xl:col-span-7 2xl:col-span-8 w-full min-w-0 bg-[#15181d] border border-stone-700/40 rounded-[2rem] p-5 md:p-6 shadow-2xl relative ${panelOpen ? 'z-[60]' : 'z-10'}`}>
        <CalendarToolbar
          date={anchor}
          view={view}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onViewChange={setView}
          onCreate={openCreate}
        />

        {error && <p className="text-red-300 text-sm mb-4">{error}</p>}

        <div className="border border-stone-700/40 rounded-2xl p-4 bg-[#0e1014] relative overflow-hidden">
          {loading && (
            <div
              className="absolute inset-0 pointer-events-none z-30"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(233,195,73,0.08) 50%, transparent 100%)',
                animation: 'shimmer-load 1.5s linear infinite',
              }}
            />
          )}
          <style>{`
            @keyframes shimmer-load {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>

          <ViewMorph view={view}>
            {view === 'semana' && (
              <WeekView date={anchor} activities={filteredActivities} onSlotClick={openSlot} onEventClick={openEvent} />
            )}
            {view === 'mes' && (
              <MonthView date={anchor} activities={filteredActivities} onDayClick={openDay} onEventClick={openEvent} />
            )}
            {view === 'anio' && (
              <YearView date={anchor} activities={activities} onMonthClick={openMonth} />
            )}
          </ViewMorph>

          {!loading && filteredActivities.length === 0 && view !== 'anio' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-stone-400 text-sm font-serif italic">El templo descansa.</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mt-2">Crea tu primera actividad</p>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-5 xl:col-span-5 2xl:col-span-4 w-full bg-[#15181d] border border-stone-700/40 rounded-[2rem] p-6 shadow-2xl">
        <h3 className={`font-serif text-2xl mb-2 ${glowText}`}>Árbol Energético Semanal</h3>
        <p className="text-stone-400 text-sm mb-6">Cada sefirá crece según las actividades que cargues en esa dimensión.</p>

        <SefirotTree sefirot={sefirot} volume={volume} filterId={filterId} onFilterToggle={toggleFilter} />
        <SefirotLegend volume={volume} filterId={filterId} onFilterToggle={toggleFilter} />
      </div>

      <ActivityPanel
        open={panelOpen}
        sefirot={sefirot}
        editing={editing}
        initialSlot={pendingSlot}
        scope={scope}
        onClose={() => setPanelOpen(false)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        onRequestDeleteScope={requestDeleteScopeFromForm}
      />

      <RecurrenceScopeDialog
        open={scopeDialog !== null}
        mode={scopeDialog?.mode ?? 'edit'}
        onChoose={handleScopeChosen}
        onCancel={() => setScopeDialog(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

Expected: PASS (no output).

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/CalendarModule.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): wire scope dialog into CalendarModule for edit/delete on series"
```

---

## Task 13: Frontend — CalendarEvent shows double border for recurring chips

**Files:**
- Modify: `frontend/src/calendar/components/CalendarEvent.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { motion } from 'framer-motion';
import type { Activity } from '../types';
import { SEFIRA_COLORS } from '../tokens';
import { eventChip } from '../motion/transitions';

type Variant = 'week' | 'month';

type Props = {
  activity: Activity;
  variant: Variant;
  style?: React.CSSProperties;
  onClick?: (a: Activity) => void;
};

export default function CalendarEvent({ activity, variant, style, onClick }: Props) {
  const color = SEFIRA_COLORS[activity.sefirot[0]?.id] ?? '#eab308';
  const sefirotLabel = activity.sefirot.map(s => s.nombre).join(', ');
  const isRecurring = !!activity.serie_id;

  const recurringBorder: React.CSSProperties = isRecurring
    ? { boxShadow: `inset 4px 0 0 -2px ${color}99` }
    : {};

  if (variant === 'week') {
    return (
      <motion.div
        layoutId={`event-${activity.id}`}
        variants={eventChip}
        initial="initial"
        animate="animate"
        exit="exit"
        whileHover={{ y: -1 }}
        onClick={() => onClick?.(activity)}
        className="absolute left-1 right-1 rounded-md px-2 py-1 cursor-pointer overflow-hidden"
        style={{
          ...style,
          background: `${color}33`,
          borderLeft: `2px solid ${color}`,
          ...recurringBorder,
        }}
      >
        <div className="text-[11px] font-semibold text-stone-100 truncate">{activity.titulo}</div>
        <div className="text-[10px] text-stone-300/80 truncate">{sefirotLabel}</div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layoutId={`event-${activity.id}`}
      variants={eventChip}
      initial="initial"
      animate="animate"
      exit="exit"
      whileHover={{ x: 1 }}
      onClick={(e) => { e.stopPropagation(); onClick?.(activity); }}
      className="rounded-sm px-1.5 py-0.5 cursor-pointer overflow-hidden truncate text-[10px] text-stone-100"
      style={{ background: `${color}33`, borderLeft: `2px solid ${color}`, ...recurringBorder }}
    >
      {activity.titulo}
    </motion.div>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/components/CalendarEvent.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): double left border on recurring event chips"
```

---

## Task 14: Manual end-to-end verification

**Files:** none (visual + behavioral checks)

- [ ] **Step 1: Ensure backend and frontend are running**

Backend at `127.0.0.1:8000`, frontend at `localhost:5173` (or `4173` for prod preview).

- [ ] **Step 2: Verify checklist**

In the browser, walking through each criterion of success in the spec:

1. Create activity with preset "Semanalmente los Sábados" → multiple Sat instances appear in the next weeks/months.
2. Create activity with custom: cada 2 semanas, lunes y miércoles, tras 8 veces → exactly 8 instances on alternating Mondays/Wednesdays.
3. Click a recurring event → scope dialog appears with default "Solo esta".
4. Choose "Solo esta" + edit title → only that instance changes; other siblings keep original title.
5. Click another recurring event → choose "Toda la serie" + change time → all instances of that series move to the new time, individual edits from step 4 are wiped (this is documented behavior).
6. Open recurring event in form → click "Borrar actividad…" → scope dialog appears for delete.
7. Choose "Solo esta" → only that one disappears. Choose "Toda la serie" → all siblings disappear.
8. Recurring chips show two thin vertical lines on the left (color border + lighter inset shadow). Non-recurring chips show only one.
9. Resumen legible below the picker updates as you toggle days/interval/end condition.
10. Create open-ended weekly series → navigate forward 1.5 years in the calendar → instances continue to appear (auto-extension working).
11. Existing non-recurring activities still work (create simple, edit, delete with two-step inline).

If any item fails, note which one and fix before considering the feature complete.

- [ ] **Step 3: Final commit (only if you fixed something during verification)**

If the checklist surfaced bugs and you patched them, commit with a fix message. Otherwise, no commit needed for this task.

---

## Notes

- `App_old.tsx` and the `fix*.py`/`replace*.py` scripts in `frontend/` remain untouched — out of scope.
- The DB ALTER TABLE in Task 1 step 3 is idempotent for the index but not for the columns. If re-running, expect a "duplicate column name" error on the columns; safe to ignore.
- `python-dateutil` is the only new backend dependency. If you maintain a `requirements.txt`, add it: `python-dateutil>=2.8`.
- "This and following events" was explicitly out of scope; if the user later asks for it, plan a separate spec — it requires RRULE splitting and is not a small change.
