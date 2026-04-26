# Espejo Cognitivo Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la vista monolítica del Espejo Cognitivo (que vive dentro de `App.tsx`) por un módulo `frontend/src/espejo/` con flujo unificado, cooldown de 30 días por pregunta, persistencia de scores IA, tinting del árbol según actividad, y carrusel de "susurros" con fragmentos de reflexiones rotando en estado idle.

**Architecture:** Backend agrega 3 endpoints (resumen agregado, respuestas con estado de cooldown, registros) + cooldown logic en POST /respuestas + persistencia en POST /evaluate. Frontend extrae el espejo de App.tsx a `frontend/src/espejo/` con orquestador + 9 componentes + 3 hooks. Tokens compartidos migran de `calendar/tokens.ts` a `shared/tokens.ts`. Sin TDD (proyecto no tiene infra de tests; alcance casi 100% visual); verificación vía `tsc -b` + smoke tests con curl + dev server.

**Tech Stack:** FastAPI + SQLAlchemy async + SQLite (existente). React 19 + TypeScript + Framer Motion (existente). `python-dateutil` ya instalado.

**Spec:** [docs/superpowers/specs/2026-04-25-espejo-cognitivo-redesign-design.md](../specs/2026-04-25-espejo-cognitivo-redesign-design.md)

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `backend/main.py` | POST /respuestas cooldown · POST /evaluate persist · 3 nuevos GET |
| Move | `frontend/src/calendar/tokens.ts` → `frontend/src/shared/tokens.ts` | Tokens compartidos |
| Modify | `frontend/src/calendar/**/*.{ts,tsx}` | Update import paths to shared/tokens |
| Modify | `frontend/src/App.tsx` | Bug del título · transición entre vistas · usa EspejoModule |
| Create | `frontend/src/espejo/types.ts` | Tipos: SefiraResumen, PreguntaConEstado, Registro |
| Create | `frontend/src/espejo/hooks/useEspejoSummary.ts` | fetch /espejo/resumen + auto-refresh |
| Create | `frontend/src/espejo/hooks/useSefiraData.ts` | fetch respuestas + registros para una sefirá |
| Create | `frontend/src/espejo/hooks/useReflectionRotation.ts` | Cursor + timer del carrusel de susurros |
| Create | `frontend/src/espejo/components/SefirotInteractiveTree.tsx` | Árbol grande con tinting y hover tooltip |
| Create | `frontend/src/espejo/components/EmptyState.tsx` | "Selecciona una emanación..." |
| Create | `frontend/src/espejo/components/RotatingReflectionPreview.tsx` | Card flotante de susurro + línea conectora |
| Create | `frontend/src/espejo/components/SefiraDetailPanel.tsx` | Contenedor scrolleable |
| Create | `frontend/src/espejo/components/SefiraHeader.tsx` | Nombre + descripción + 3 stats |
| Create | `frontend/src/espejo/components/Sparkline.tsx` | Mini sparkline SVG (compartible) |
| Create | `frontend/src/espejo/components/LastReflection.tsx` | Card colapsable de la última reflexión |
| Create | `frontend/src/espejo/components/GuideQuestionsList.tsx` | Lista de QuestionCard |
| Create | `frontend/src/espejo/components/QuestionCard.tsx` | 3 estados (nueva/vencida/bloqueada) |
| Create | `frontend/src/espejo/components/ReflectionEditor.tsx` | Slider + textarea + evaluate + render IA |
| Create | `frontend/src/espejo/components/HistoryList.tsx` | Lista colapsable de reflexiones pasadas |
| Create | `frontend/src/espejo/EspejoModule.tsx` | Orquestador |
| Create | `frontend/src/espejo/index.ts` | Barrel export |

---

## Task 1: Backend — POST /respuestas con cooldown 30 días

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Reemplazar `save_respuesta`**

Buscar `@app.post("/respuestas")` (~línea 177) y reemplazar la función entera por:

```python
@app.post("/respuestas")
async def save_respuesta(rep: RespuestaCreate, db: AsyncSession = Depends(get_db)):
    last = (await db.execute(
        select(RespuestaPregunta)
        .where(RespuestaPregunta.pregunta_id == rep.pregunta_id)
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

    nueva = RespuestaPregunta(pregunta_id=rep.pregunta_id, respuesta_texto=rep.respuesta_texto)
    db.add(nueva)
    await db.commit()
    await db.refresh(nueva)
    return nueva
```

- [ ] **Step 2: Smoke test cooldown**

Necesitás una pregunta existente. Listar las de jésed:

```bash
curl -s http://127.0.0.1:8000/preguntas/jesed | python -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else 'NO_QUESTIONS — create one in admin panel first')"
```

Si no hay preguntas, crear una:

```bash
curl -s -X POST http://127.0.0.1:8000/preguntas -H "Content-Type: application/json" -d '{"sefira_id":"jesed","texto":"¿Cómo manifestaste misericordia esta semana?"}' | python -c "import sys,json; d=json.load(sys.stdin); print('Created pregunta_id:', d['id'])"
```

Luego responderla:

```bash
curl -s -X POST http://127.0.0.1:8000/respuestas -H "Content-Type: application/json" -d '{"pregunta_id":"<PREGUNTA_ID>","respuesta_texto":"Ayudé a mi hermana"}'
```

Esperás respuesta 200 con la nueva respuesta.

Inmediatamente repetir → debería devolver 409:

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST http://127.0.0.1:8000/respuestas -H "Content-Type: application/json" -d '{"pregunta_id":"<PREGUNTA_ID>","respuesta_texto":"Otra"}'
```

Esperado: `HTTP 409` y mensaje `"Esta pregunta vuelve a estar disponible el ..."`.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add backend/main.py
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(backend): enforce 30-day cooldown on POST /respuestas (409 if violated)"
```

---

## Task 2: Backend — POST /evaluate persiste a RegistroDiario

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Agregar `sefira_id` al request y persistencia**

Buscar `class EvaluationRequest` (~línea 128) y reemplazar:

```python
class EvaluationRequest(BaseModel):
    sefira: str
    sefira_id: str
    text: str
    score: float
```

Buscar `@app.post("/evaluate", ...)` (~línea 137) y reemplazar la función:

```python
@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(request: EvaluationRequest, db: AsyncSession = Depends(get_db)):
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
    )
    db.add(registro)
    await db.commit()

    return EvaluationResponse(ai_score=ai_score, feedback=feedback)
```

- [ ] **Step 2: Smoke test persistencia**

```bash
curl -s -X POST http://127.0.0.1:8000/evaluate -H "Content-Type: application/json" -d '{"sefira":"Jésed","sefira_id":"jesed","text":"Probando persistencia","score":7.0}'
```

Esperado: JSON `{"ai_score": ..., "feedback": "..."}`. Verificá en DB:

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/backend" && python -c "
import sqlite3
c = sqlite3.connect('kabbalah.db')
rows = c.execute('SELECT sefira_id, reflexion_texto, puntuacion_ia FROM registros_diario ORDER BY fecha_registro DESC LIMIT 3').fetchall()
for r in rows:
    print(r)
c.close()"
```

Esperado: ver tu nueva entrada con `('jesed', 'Probando persistencia', <int>)`.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add backend/main.py
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(backend): POST /evaluate persists analysis to RegistroDiario"
```

---

## Task 3: Backend — 3 nuevos endpoints (resumen + respuestas + registros)

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Agregar Pydantic models nuevos**

Después del bloque de modelos existentes (debajo de `class RespuestaCreate`), agregar:

```python
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
```

- [ ] **Step 2: Agregar el endpoint `GET /respuestas/{sefira_id}`**

Después de `@app.get("/preguntas/{sefira_id}", ...)` (línea ~150), agregar:

```python
@app.get("/respuestas/{sefira_id}", response_model=list[PreguntaConEstado])
async def get_respuestas_estado(sefira_id: str, db: AsyncSession = Depends(get_db)):
    preguntas = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.sefira_id == sefira_id)
    )).scalars().all()

    today = datetime.utcnow()
    out: list[PreguntaConEstado] = []
    for p in preguntas:
        last = (await db.execute(
            select(RespuestaPregunta)
            .where(RespuestaPregunta.pregunta_id == p.id)
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
```

- [ ] **Step 3: Agregar `GET /registros/{sefira_id}`**

Justo debajo del anterior:

```python
@app.get("/registros/{sefira_id}", response_model=list[RegistroOut])
async def get_registros(sefira_id: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(RegistroDiario)
        .where(RegistroDiario.sefira_id == sefira_id)
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
```

- [ ] **Step 4: Agregar `GET /espejo/resumen`**

```python
@app.get("/espejo/resumen", response_model=list[SefiraResumen])
async def espejo_resumen(db: AsyncSession = Depends(get_db)):
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
                .where(RespuestaPregunta.pregunta_id == pid)
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
            .where(RegistroDiario.sefira_id == s.id)
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
```

- [ ] **Step 5: Smoke test**

```bash
curl -s http://127.0.0.1:8000/espejo/resumen | python -c "
import sys,json
d = json.load(sys.stdin)
print(f'{len(d)} sefirot')
for s in d:
    if s['preguntas_total'] > 0 or s['ultima_actividad']:
        print(f\"{s['sefira_id']}: total={s['preguntas_total']} frescas={s['preguntas_frescas']} intensidad={s['intensidad']} score={s['score_ia_promedio']}\")
"
```

Esperado: 10 sefirot, las que tienen preguntas o registros muestran sus stats.

```bash
curl -s http://127.0.0.1:8000/respuestas/jesed | python -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} preguntas en jesed'); [print(p['texto_pregunta'][:40], '· bloqueada' if p['bloqueada'] else '· disponible') for p in d]"
```

```bash
curl -s http://127.0.0.1:8000/registros/jesed | python -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} registros en jesed')"
```

- [ ] **Step 6: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add backend/main.py
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(backend): add /espejo/resumen, /respuestas/{id}, /registros/{id} endpoints"
```

---

## Task 4: Frontend — Mover tokens a `shared/`

**Files:**
- Move: `frontend/src/calendar/tokens.ts` → `frontend/src/shared/tokens.ts`
- Modify: todos los imports en `frontend/src/calendar/**`

- [ ] **Step 1: Mover el archivo**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
mkdir -p src/shared
git mv src/calendar/tokens.ts src/shared/tokens.ts
```

- [ ] **Step 2: Actualizar imports en calendar**

Buscar todos los archivos que importan `tokens`:

```bash
cd "c:/Users/123/Desktop/Kabbalah Space"
grep -rln "from '../tokens'" frontend/src/calendar
grep -rln "from '../../tokens'" frontend/src/calendar
grep -rln "from './tokens'" frontend/src/calendar
```

Por cada archivo en `frontend/src/calendar/components/` o `views/` que importa `'../tokens'`, cambiar a `'../../shared/tokens'`.
Por cada archivo en `frontend/src/calendar/hooks/`, mismo cambio.
Por cada archivo en `frontend/src/calendar/motion/`, cambiar `'../tokens'` a `'../../shared/tokens'`.
Para `frontend/src/calendar/CalendarModule.tsx` (que importa `'./tokens'`), cambiar a `'../shared/tokens'`.

Comando rápido (Bash):

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
# Componentes y views (un nivel debajo de src/calendar)
sed -i "s|from '../tokens'|from '../../shared/tokens'|g" src/calendar/components/*.tsx src/calendar/views/*.tsx src/calendar/hooks/*.ts src/calendar/motion/*.ts
# CalendarModule.tsx (raíz de src/calendar)
sed -i "s|from './tokens'|from '../shared/tokens'|g" src/calendar/CalendarModule.tsx
```

- [ ] **Step 3: Type check**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

Esperado: PASS. Si algún archivo se quedó con import roto, el error indica cuál.

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add -A frontend/src/calendar frontend/src/shared
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "refactor(frontend): move calendar tokens to shared/ for cross-module reuse"
```

---

## Task 5: Frontend — Tipos y hooks de espejo

**Files:**
- Create: `frontend/src/espejo/types.ts`
- Create: `frontend/src/espejo/hooks/useEspejoSummary.ts`
- Create: `frontend/src/espejo/hooks/useSefiraData.ts`

- [ ] **Step 1: Crear `frontend/src/espejo/types.ts`**

```bash
mkdir -p "c:/Users/123/Desktop/Kabbalah Space/frontend/src/espejo/hooks"
mkdir -p "c:/Users/123/Desktop/Kabbalah Space/frontend/src/espejo/components"
```

```ts
export type SefiraResumen = {
  sefira_id: string;
  sefira_nombre: string;
  preguntas_total: number;
  preguntas_frescas: number;
  preguntas_disponibles: number;
  score_ia_promedio: number | null;
  score_ia_ultimos: number[];
  ultima_reflexion_texto: string | null;
  ultima_reflexion_score: number | null;
  ultima_actividad: string | null;
  intensidad: number;
};

export type PreguntaConEstado = {
  pregunta_id: string;
  texto_pregunta: string;
  ultima_respuesta: string | null;
  fecha_ultima: string | null;
  siguiente_disponible: string | null;
  bloqueada: boolean;
  dias_restantes: number | null;
};

export type Registro = {
  id: string;
  reflexion_texto: string;
  puntuacion_usuario: number | null;
  puntuacion_ia: number | null;
  fecha_registro: string;
};
```

- [ ] **Step 2: Crear `frontend/src/espejo/hooks/useEspejoSummary.ts`**

```ts
import { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '../../shared/tokens';
import type { SefiraResumen } from '../types';

export function useEspejoSummary() {
  const [summary, setSummary] = useState<SefiraResumen[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/espejo/resumen`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { summary, loading, reload };
}
```

- [ ] **Step 3: Crear `frontend/src/espejo/hooks/useSefiraData.ts`**

```ts
import { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '../../shared/tokens';
import type { PreguntaConEstado, Registro } from '../types';

export function useSefiraData(sefiraId: string | null) {
  const [preguntas, setPreguntas] = useState<PreguntaConEstado[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!sefiraId) {
      setPreguntas([]);
      setRegistros([]);
      return;
    }
    setLoading(true);
    try {
      const [pRes, rRes] = await Promise.all([
        fetch(`${API_BASE}/respuestas/${sefiraId}`),
        fetch(`${API_BASE}/registros/${sefiraId}`),
      ]);
      if (pRes.ok) setPreguntas(await pRes.json());
      if (rRes.ok) setRegistros(await rRes.json());
    } finally {
      setLoading(false);
    }
  }, [sefiraId]);

  useEffect(() => { void reload(); }, [reload]);

  return { preguntas, registros, loading, reload };
}
```

- [ ] **Step 4: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/espejo/types.ts frontend/src/espejo/hooks
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(espejo): add types and data hooks"
```

---

## Task 6: Frontend — Hook de rotación de susurros

**Files:**
- Create: `frontend/src/espejo/hooks/useReflectionRotation.ts`

- [ ] **Step 1: Crear el hook**

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SefiraResumen } from '../types';

const PHASE_DURATION = 5300; // entrada 700 + quietud 3800 + salida 500 + gap 300

export function useReflectionRotation(items: SefiraResumen[], active: boolean) {
  const sorted = useMemo(() => {
    return items
      .filter(s => s.score_ia_promedio !== null && s.ultima_reflexion_texto)
      .sort((a, b) => {
        const sa = a.score_ia_promedio ?? 0;
        const sb = b.score_ia_promedio ?? 0;
        if (sb !== sa) return sb - sa;
        const ta = a.ultima_actividad ? new Date(a.ultima_actividad).getTime() : 0;
        const tb = b.ultima_actividad ? new Date(b.ultima_actividad).getTime() : 0;
        return tb - ta;
      });
  }, [items]);

  const [index, setIndex] = useState(0);
  const hoveredRef = useRef(false);
  const visibilityRef = useRef(typeof document !== 'undefined' ? !document.hidden : true);

  useEffect(() => {
    if (!active || sorted.length === 0) return;
    const id = window.setInterval(() => {
      if (hoveredRef.current || !visibilityRef.current) return;
      setIndex(i => (i + 1) % sorted.length);
    }, PHASE_DURATION);
    return () => window.clearInterval(id);
  }, [active, sorted.length]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => { visibilityRef.current = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (index >= sorted.length) setIndex(0);
  }, [sorted.length, index]);

  const current = active && sorted.length > 0 ? sorted[index % sorted.length] : null;

  function setHovered(h: boolean) {
    hoveredRef.current = h;
  }

  return { current, setHovered, total: sorted.length };
}
```

- [ ] **Step 2: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/espejo/hooks/useReflectionRotation.ts
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(espejo): add useReflectionRotation hook with cursor + pause logic"
```

---

## Task 7: Frontend — SefirotInteractiveTree con tinting

**Files:**
- Create: `frontend/src/espejo/components/SefirotInteractiveTree.tsx`

- [ ] **Step 1: Crear el árbol**

```tsx
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SefiraResumen } from '../types';
import { SEFIRA_COLORS } from '../../shared/tokens';

export type SefiraNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  description: string;
};

const CONNECTIONS: { n1: string; n2: string; label: string }[] = [
  { n1: 'keter', n2: 'jojma', label: 'א' }, { n1: 'keter', n2: 'bina', label: 'ב' },
  { n1: 'keter', n2: 'tiferet', label: 'ג' }, { n1: 'jojma', n2: 'bina', label: 'ד' },
  { n1: 'jojma', n2: 'tiferet', label: 'ה' }, { n1: 'bina', n2: 'tiferet', label: 'ז' },
  { n1: 'jojma', n2: 'jesed', label: 'ו' }, { n1: 'bina', n2: 'gevura', label: 'ח' },
  { n1: 'jesed', n2: 'netzaj', label: 'כ' }, { n1: 'gevura', n2: 'hod', label: 'מ' },
  { n1: 'jesed', n2: 'gevura', label: 'ט' }, { n1: 'netzaj', n2: 'hod', label: 'פ' },
  { n1: 'jesed', n2: 'tiferet', label: 'י' }, { n1: 'gevura', n2: 'tiferet', label: 'ל' },
  { n1: 'netzaj', n2: 'tiferet', label: 'נ' }, { n1: 'hod', n2: 'tiferet', label: 'ע' },
  { n1: 'yesod', n2: 'tiferet', label: 'ס' }, { n1: 'netzaj', n2: 'yesod', label: 'צ' },
  { n1: 'hod', n2: 'yesod', label: 'ר' }, { n1: 'netzaj', n2: 'maljut', label: 'ק' },
  { n1: 'hod', n2: 'maljut', label: 'ש' }, { n1: 'yesod', n2: 'maljut', label: 'ת' },
];

type Props = {
  sefirot: SefiraNode[];
  summary: SefiraResumen[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

type HoverState = { id: string; clientX: number; clientY: number } | null;

export default function SefirotInteractiveTree({ sefirot, summary, selectedId, onSelect }: Props) {
  const [hover, setHover] = useState<HoverState>(null);
  const summaryMap = useMemo(() => {
    const m: Record<string, SefiraResumen> = {};
    for (const s of summary) m[s.sefira_id] = s;
    return m;
  }, [summary]);

  function intensityOf(id: string): number {
    return summaryMap[id]?.intensidad ?? 0;
  }

  const hoveredNode = hover ? sefirot.find(s => s.id === hover.id) : null;
  const hoveredSummary = hover ? summaryMap[hover.id] : null;

  return (
    <div className="relative w-[400px] h-[800px] select-none">
      <svg viewBox="0 0 400 800" className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="treeLineGlow" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="400" y2="800">
            <stop offset="0%" stopColor="#d6d3d1" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#fef08a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#d6d3d1" stopOpacity="0.1" />
          </linearGradient>
          <filter id="treeGlow" filterUnits="userSpaceOnUse" x="-100" y="-100" width="600" height="1000">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {CONNECTIONS.map((c, i) => {
          const a = sefirot.find(s => s.id === c.n1);
          const b = sefirot.find(s => s.id === c.n2);
          if (!a || !b) return null;
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="url(#treeLineGlow)" strokeWidth={4} strokeLinecap="round" />
              <rect x={midX - 12} y={midY - 12} width={24} height={24} fill="#070709" rx={12} opacity={0.85} />
              <text x={midX} y={midY} fill="#fef08a" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: 'David, serif', fontSize: 16, opacity: 0.9 }}>{c.label}</text>
            </g>
          );
        })}

        {sefirot.map(node => {
          const intensity = intensityOf(node.id);
          const haloR = 38 + intensity * 28;
          const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
          return (
            <circle
              key={`halo-${node.id}`}
              cx={node.x} cy={node.y} r={haloR}
              fill={color}
              filter="url(#treeGlow)"
              opacity={0.18 + intensity * 0.32}
              style={{ transition: 'opacity 600ms cubic-bezier(0.16,1,0.3,1), r 600ms cubic-bezier(0.16,1,0.3,1)' }}
            />
          );
        })}
      </svg>

      {sefirot.map(node => {
        const intensity = intensityOf(node.id);
        const isSelected = selectedId === node.id;
        const orbOpacity = 0.4 + intensity * 0.6;
        const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
        return (
          <div
            key={node.id}
            onClick={() => onSelect(node.id)}
            onMouseEnter={(e) => setHover({ id: node.id, clientX: e.clientX, clientY: e.clientY })}
            onMouseLeave={() => setHover(prev => (prev?.id === node.id ? null : prev))}
            className={`absolute w-16 h-16 sm:w-20 sm:h-20 -ml-8 -mt-8 sm:-ml-10 sm:-mt-10 rounded-full flex items-center justify-center cursor-pointer z-10 ${isSelected ? 'ring-4 ring-amber-300/70 ring-offset-4 ring-offset-[#070709] cal-breath-ring' : ''}`}
            style={{
              left: node.x,
              top: node.y,
              opacity: orbOpacity,
              background: `radial-gradient(circle at 30% 30%, ${color}ff 0%, ${color}aa 60%, ${color}55 100%)`,
              border: '2px solid rgba(255,255,255,0.2)',
              boxShadow: `inset -8px -8px 16px rgba(0,0,0,0.6), inset 8px 8px 16px rgba(255,255,255,0.3), 0 0 ${10 + intensity * 30}px ${color}88`,
              transform: isSelected ? 'scale(1.15)' : 'scale(1)',
              transition: 'opacity 600ms, box-shadow 600ms, transform 300ms cubic-bezier(0.22,1,0.36,1)',
            }}
            title={node.description}
          >
            <span className="text-[10px] font-bold tracking-widest text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {node.name.toUpperCase()}
            </span>
          </div>
        );
      })}

      <AnimatePresence>
        {hoveredNode && (
          <motion.div
            key={hoveredNode.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute pointer-events-none z-20 bg-[#0e1014]/95 border border-stone-700/50 rounded-lg px-3 py-2 shadow-xl backdrop-blur"
            style={{
              left: hoveredNode.x,
              top: hoveredNode.y - 60,
              transform: 'translateX(-50%)',
              minWidth: 180,
            }}
          >
            <p className="text-[11px] font-semibold text-amber-100 uppercase tracking-wider">{hoveredNode.name}</p>
            <p className="text-[10px] text-stone-300/80 mt-1 leading-snug line-clamp-2">{hoveredNode.description}</p>
            <p className="text-[10px] text-amber-200/80 mt-1 tabular-nums">
              {hoveredSummary?.preguntas_disponibles ?? 0} disp ·{' '}
              {hoveredSummary?.score_ia_promedio !== null ? `IA ${hoveredSummary?.score_ia_promedio}` : 'sin score'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/espejo/components/SefirotInteractiveTree.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(espejo): add SefirotInteractiveTree with intensity tinting and hover tooltip"
```

---

## Task 8: Frontend — Susurros (RotatingReflectionPreview)

**Files:**
- Create: `frontend/src/espejo/components/RotatingReflectionPreview.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { SefiraResumen } from '../types';
import type { SefiraNode } from './SefirotInteractiveTree';
import { SEFIRA_COLORS } from '../../shared/tokens';
import { useReflectionRotation } from '../hooks/useReflectionRotation';

type Props = {
  sefirot: SefiraNode[];
  summary: SefiraResumen[];
  active: boolean;
  onSelectSefira: (id: string) => void;
};

function snippet(text: string, max = 100): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return `"${t}"`;
  return `"${t.slice(0, max - 1)}…"`;
}

function cardPosition(node: SefiraNode): React.CSSProperties {
  const xPct = (node.x / 400) * 100;
  const yPct = (node.y / 800) * 100;
  if (node.x < 160) {
    return { left: `calc(${xPct}% + 60px)`, top: `${yPct}%`, transform: 'translateY(-50%)' };
  }
  if (node.x > 240) {
    return { right: `calc(${100 - xPct}% + 60px)`, top: `${yPct}%`, transform: 'translateY(-50%)' };
  }
  if (node.y < 400) {
    return { left: `${xPct}%`, top: `calc(${yPct}% + 60px)`, transform: 'translateX(-50%)' };
  }
  return { left: `${xPct}%`, bottom: `calc(${100 - yPct}% + 60px)`, transform: 'translateX(-50%)' };
}

export default function RotatingReflectionPreview({ sefirot, summary, active, onSelectSefira }: Props) {
  const reduced = useReducedMotion();
  const { current, setHovered } = useReflectionRotation(summary, active && !reduced);

  if (!current) return null;
  const node = sefirot.find(s => s.id === current.sefira_id);
  if (!node) return null;
  const color = SEFIRA_COLORS[current.sefira_id] ?? '#eab308';
  const pos = cardPosition(node);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={current.sefira_id}
        initial={{ opacity: 0, scale: 0.94, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: [0, -2, 0, 2, 0] }}
        exit={{ opacity: 0, y: -6 }}
        transition={{
          opacity: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
          scale: { duration: 0.7 },
          y: { duration: 4, ease: 'easeInOut', repeat: Infinity },
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="absolute z-30 bg-[#0e1014]/95 backdrop-blur-md border rounded-xl shadow-xl px-3.5 py-3 w-[280px]"
        style={{
          ...pos,
          borderColor: `${color}55`,
          borderLeft: `2px solid ${color}`,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-[10px] uppercase tracking-wider text-stone-200">{current.sefira_nombre}</span>
          </div>
          <span className="text-[10px] tabular-nums px-2 py-0.5 rounded-full bg-amber-300/15 text-amber-200">
            {current.score_ia_promedio}
          </span>
        </div>
        <p className="text-xs text-stone-300/90 italic line-clamp-3 leading-snug mb-3">
          {snippet(current.ultima_reflexion_texto ?? '', 100)}
        </p>
        <button
          type="button"
          onClick={() => onSelectSefira(current.sefira_id)}
          className="text-[11px] text-amber-300/80 hover:text-amber-200 inline-flex items-center gap-1 transition-colors"
        >
          Ver más <span aria-hidden>→</span>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/espejo/components/RotatingReflectionPreview.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(espejo): add RotatingReflectionPreview susurros card with smart positioning"
```

---

## Task 9: Frontend — Sub-componentes del panel (Sparkline, Header, LastReflection)

**Files:**
- Create: `frontend/src/espejo/components/Sparkline.tsx`
- Create: `frontend/src/espejo/components/SefiraHeader.tsx`
- Create: `frontend/src/espejo/components/LastReflection.tsx`

- [ ] **Step 1: `Sparkline.tsx`**

```tsx
type Props = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
};

export default function Sparkline({ values, width = 80, height = 20, color = '#e9c349' }: Props) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
    </svg>
  );
}
```

- [ ] **Step 2: `SefiraHeader.tsx`**

```tsx
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SefiraResumen } from '../types';
import Sparkline from './Sparkline';

type Props = {
  resumen: SefiraResumen;
  description: string;
};

export default function SefiraHeader({ resumen, description }: Props) {
  const ultimaTexto = resumen.ultima_actividad
    ? `hace ${formatDistanceToNow(new Date(resumen.ultima_actividad), { locale: es })}`
    : 'Sin reflexiones aún';

  return (
    <div>
      <h3 className="font-serif text-4xl text-amber-100/95 tracking-tight">{resumen.sefira_nombre}</h3>
      <div className="h-px w-32 bg-gradient-to-r from-amber-300/60 to-transparent my-4" />
      <p className="text-stone-300/90 text-sm leading-relaxed mb-6">{description}</p>

      <div className="grid grid-cols-3 gap-3">
        <Stat
          big={`${resumen.preguntas_disponibles}/${resumen.preguntas_total}`}
          label="Reflexiones disponibles"
        />
        <Stat
          big={resumen.score_ia_promedio !== null ? `IA ${resumen.score_ia_promedio}` : '—'}
          label="Score promedio"
          extra={resumen.score_ia_ultimos.length >= 2 ? <Sparkline values={resumen.score_ia_ultimos} /> : null}
        />
        <Stat
          big={ultimaTexto}
          label="Última actividad"
        />
      </div>
    </div>
  );
}

function Stat({ big, label, extra }: { big: string; label: string; extra?: React.ReactNode }) {
  return (
    <div className="bg-stone-900/40 border border-stone-800/50 rounded-xl p-3">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-amber-100/90 text-xl">{big}</span>
        {extra}
      </div>
      <p className="text-[9px] uppercase tracking-[0.16em] text-stone-500 mt-1">{label}</p>
    </div>
  );
}
```

- [ ] **Step 3: `LastReflection.tsx`**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Registro } from '../types';

type Props = { registro: Registro };

export default function LastReflection({ registro }: Props) {
  const [open, setOpen] = useState(false);
  const fecha = format(new Date(registro.fecha_registro), "d 'de' MMMM", { locale: es });

  return (
    <div className="rounded-xl border border-stone-700/40 bg-stone-950/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-900/40 transition-colors"
      >
        <div className="flex items-center gap-3 text-sm text-stone-200">
          <span className="text-[10px] uppercase tracking-[0.16em] text-amber-200/80">Tu última reflexión</span>
          <span className="text-stone-500">·</span>
          <span className="text-stone-400">{fecha}</span>
          {registro.puntuacion_ia !== null && (
            <>
              <span className="text-stone-500">·</span>
              <span className="text-amber-200/80">IA {registro.puntuacion_ia}/10</span>
            </>
          )}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }}>
          <ChevronDown size={16} className="text-stone-400" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 text-sm text-stone-300/90 italic leading-relaxed border-t border-stone-800/50 pt-3">
              "{registro.reflexion_texto}"
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/espejo/components/Sparkline.tsx frontend/src/espejo/components/SefiraHeader.tsx frontend/src/espejo/components/LastReflection.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(espejo): add Sparkline, SefiraHeader, LastReflection components"
```

---

## Task 10: Frontend — QuestionCard + GuideQuestionsList

**Files:**
- Create: `frontend/src/espejo/components/QuestionCard.tsx`
- Create: `frontend/src/espejo/components/GuideQuestionsList.tsx`

- [ ] **Step 1: `QuestionCard.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Lock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { PreguntaConEstado } from '../types';
import { API_BASE } from '../../shared/tokens';

type Props = {
  pregunta: PreguntaConEstado;
  onSaved: () => void;
};

export default function QuestionCard({ pregunta, onSaved }: Props) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  useEffect(() => { setText(''); setError(null); }, [pregunta.pregunta_id]);

  async function handleSave() {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/respuestas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta_id: pregunta.pregunta_id, respuesta_texto: text.trim() }),
      });
      if (res.ok) {
        setText('');
        onSaved();
      } else {
        const data = await res.json().catch(() => ({ detail: 'No se pudo guardar' }));
        setError(data.detail ?? 'No se pudo guardar');
        setShake(s => s + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  const showLast = pregunta.ultima_respuesta !== null;
  const fechaLast = pregunta.fecha_ultima ? format(parseISO(pregunta.fecha_ultima), "d 'de' MMMM", { locale: es }) : '';
  const fechaNext = pregunta.siguiente_disponible ? format(parseISO(pregunta.siguiente_disponible), "d 'de' MMMM", { locale: es }) : '';

  return (
    <motion.div
      key={shake}
      animate={shake ? { x: [-3, 3, -2, 2, 0] } : { x: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-stone-700/40 bg-stone-950/30 p-4 space-y-3"
    >
      <p className="text-sm text-stone-200 leading-relaxed">{pregunta.texto_pregunta}</p>

      {showLast && (
        <details className="text-xs text-stone-400 group">
          <summary className="cursor-pointer hover:text-stone-300 inline-flex items-center gap-1">
            <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
            Tu última respuesta · {fechaLast}
          </summary>
          <p className="mt-2 italic text-stone-300/80 pl-3 border-l border-stone-700/40">
            {pregunta.ultima_respuesta}
          </p>
        </details>
      )}

      {pregunta.bloqueada ? (
        <div className="rounded-lg bg-stone-950/60 border border-stone-700/30 p-3 flex items-center gap-3">
          <Lock size={14} className="text-amber-300/60 shrink-0" />
          <div className="text-xs text-stone-400">
            Disponible nuevamente el <span className="text-amber-200/80">{fechaNext}</span>
            {pregunta.dias_restantes !== null && (
              <span className="block text-[10px] text-stone-500 mt-0.5">en {pregunta.dias_restantes} días</span>
            )}
          </div>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={handleSave}
          placeholder={showLast ? 'Nueva entrada...' : 'Escribí tu reflexión...'}
          disabled={saving}
          className="w-full min-h-[80px] resize-y bg-[#1b1f25] border border-stone-700/50 focus:border-amber-300/60 focus:outline-none text-sm text-stone-100 rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
        />
      )}

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="text-red-400 text-[11px]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {!pregunta.bloqueada && (
        <p className="text-[10px] text-stone-500">Se guarda al salir del campo</p>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: `GuideQuestionsList.tsx`**

```tsx
import { motion } from 'framer-motion';
import type { PreguntaConEstado } from '../types';
import QuestionCard from './QuestionCard';

type Props = {
  preguntas: PreguntaConEstado[];
  onSaved: () => void;
};

export default function GuideQuestionsList({ preguntas, onSaved }: Props) {
  if (preguntas.length === 0) {
    return (
      <p className="text-xs text-stone-500 italic text-center py-4">
        No hay preguntas guía para esta sefirá. Agregá algunas desde el Panel de Administrador.
      </p>
    );
  }
  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
      className="space-y-3"
    >
      {preguntas.map(p => (
        <motion.div
          key={p.pregunta_id}
          variants={{
            initial: { opacity: 0, y: 8 },
            animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
          }}
        >
          <QuestionCard pregunta={p} onSaved={onSaved} />
        </motion.div>
      ))}
    </motion.div>
  );
}
```

- [ ] **Step 3: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/espejo/components/QuestionCard.tsx frontend/src/espejo/components/GuideQuestionsList.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(espejo): add QuestionCard with cooldown states + GuideQuestionsList stagger"
```

---

## Task 11: Frontend — ReflectionEditor

**Files:**
- Create: `frontend/src/espejo/components/ReflectionEditor.tsx`

- [ ] **Step 1: Crear el editor**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE } from '../../shared/tokens';

type Props = {
  sefiraId: string;
  sefiraName: string;
  onSaved: () => void;
};

type Feedback = { score: number; text: string };

export default function ReflectionEditor({ sefiraId, sefiraName, onSaved }: Props) {
  const [score, setScore] = useState(5);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sefira: sefiraName, sefira_id: sefiraId, text, score }),
      });
      if (res.ok) {
        const data = await res.json();
        setFeedback({ score: data.ai_score, text: data.feedback });
        onSaved();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const trackPercent = ((score - 1) / 9) * 100;

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-stone-700/40 bg-stone-950/30 p-5 space-y-5">
      <div>
        <div className="flex justify-between items-baseline mb-3">
          <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Nivelación de energía</label>
          <span className="font-serif text-2xl text-amber-200/90 tabular-nums">
            {score.toFixed(1)}<span className="text-stone-500 text-sm">/10</span>
          </span>
        </div>
        <div className="relative w-full h-1.5 bg-stone-800 rounded-full">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-stone-500 to-amber-200/80 rounded-full pointer-events-none"
            style={{ width: `${trackPercent}%`, transition: 'width 0.1s linear' }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-amber-200 border-2 border-[#070709] shadow-[0_0_10px_rgba(253,230,138,0.6)]" />
          </div>
          <input
            type="range" min={1} max={10} step={0.1} value={score}
            onChange={e => setScore(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400 block mb-2">Reflexión global</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          required
          placeholder="Detallá cómo esta energía se manifiesta en tus decisiones o bloqueos..."
          className="w-full min-h-[120px] resize-y bg-[#1b1f25] border border-stone-700/50 focus:border-amber-300/60 focus:outline-none text-sm text-stone-100 rounded-lg px-3 py-2 transition-colors"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !text.trim()}
        className="w-full rounded-xl bg-gradient-to-r from-amber-200/95 to-amber-100 text-stone-900 font-semibold text-xs uppercase tracking-[0.18em] py-3 hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {submitting ? <LoadingDots /> : 'Recibir Diagnóstico IA'}
      </button>

      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-4"
          >
            <div className="flex items-baseline gap-3 mb-3">
              <span className="font-serif text-3xl text-amber-200/95">{feedback.score.toFixed(1)}</span>
              <span className="text-[10px] uppercase tracking-wider text-stone-400 border border-stone-700/50 px-2 py-0.5 rounded">
                Score Coherencia IA
              </span>
            </div>
            <p className="text-sm text-stone-300/90 leading-relaxed whitespace-pre-line">{feedback.text}</p>
          </motion.div>
        )}
      </AnimatePresence>
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

- [ ] **Step 2: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/espejo/components/ReflectionEditor.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(espejo): add ReflectionEditor (slider + textarea + IA evaluate + feedback render)"
```

---

## Task 12: Frontend — HistoryList + EmptyState + SefiraDetailPanel

**Files:**
- Create: `frontend/src/espejo/components/HistoryList.tsx`
- Create: `frontend/src/espejo/components/EmptyState.tsx`
- Create: `frontend/src/espejo/components/SefiraDetailPanel.tsx`

- [ ] **Step 1: `HistoryList.tsx`**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Registro } from '../types';

type Props = { registros: Registro[] };

export default function HistoryList({ registros }: Props) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (registros.length <= 1) return null;
  const previous = registros.slice(1);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between rounded-xl border border-stone-700/40 bg-stone-950/30 px-4 py-3 hover:bg-stone-900/40 transition-colors"
      >
        <span className="text-xs uppercase tracking-[0.16em] text-stone-300">
          Ver historial completo ({previous.length} entradas)
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }}>
          <ChevronDown size={16} className="text-stone-400" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-2 mt-3">
              {previous.map(r => {
                const isExp = expanded === r.id;
                const fecha = format(parseISO(r.fecha_registro), "d 'de' MMMM yyyy", { locale: es });
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setExpanded(isExp ? null : r.id)}
                    className="w-full text-left rounded-lg border border-stone-800/50 bg-stone-950/20 hover:bg-stone-900/40 px-3 py-2 transition-colors"
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-stone-300">{fecha}</span>
                      {r.puntuacion_ia !== null && (
                        <span className="text-amber-200/80 tabular-nums">IA {r.puntuacion_ia}/10</span>
                      )}
                    </div>
                    <p className={`text-xs text-stone-400 italic leading-snug ${isExp ? '' : 'line-clamp-1'}`}>
                      "{r.reflexion_texto}"
                    </p>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: `EmptyState.tsx`**

```tsx
export default function EmptyState() {
  return (
    <div className="text-center opacity-60 flex flex-col items-center justify-center h-full min-h-[400px] px-6">
      <span className="material-symbols-outlined text-5xl mb-6 font-light">touch_app</span>
      <p className="text-stone-400 text-sm font-mono uppercase tracking-[0.15em] leading-relaxed">
        Selecciona una emanación en el árbol<br/>para explorar su sabiduría
      </p>
      <p className="text-[10px] text-stone-500 mt-6 italic max-w-xs">
        Las cards flotantes muestran fragmentos de tus reflexiones, ordenados por score IA.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: `SefiraDetailPanel.tsx`**

```tsx
import { motion } from 'framer-motion';
import type { SefiraResumen, PreguntaConEstado, Registro } from '../types';
import SefiraHeader from './SefiraHeader';
import LastReflection from './LastReflection';
import GuideQuestionsList from './GuideQuestionsList';
import ReflectionEditor from './ReflectionEditor';
import HistoryList from './HistoryList';

type Props = {
  resumen: SefiraResumen;
  description: string;
  preguntas: PreguntaConEstado[];
  registros: Registro[];
  onDataChanged: () => void;
};

export default function SefiraDetailPanel({ resumen, description, preguntas, registros, onDataChanged }: Props) {
  const ultima = registros[0] ?? null;

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
      className="space-y-6"
    >
      <Section><SefiraHeader resumen={resumen} description={description} /></Section>

      {ultima && (
        <Section><LastReflection registro={ultima} /></Section>
      )}

      <Section>
        <h4 className="text-xs uppercase tracking-[0.16em] text-stone-400 mb-3">Preguntas guía</h4>
        <GuideQuestionsList preguntas={preguntas} onSaved={onDataChanged} />
      </Section>

      <Section>
        <h4 className="text-xs uppercase tracking-[0.16em] text-stone-400 mb-3">Nueva reflexión</h4>
        <ReflectionEditor
          sefiraId={resumen.sefira_id}
          sefiraName={resumen.sefira_nombre}
          onSaved={onDataChanged}
        />
      </Section>

      {registros.length > 1 && (
        <Section><HistoryList registros={registros} /></Section>
      )}
    </motion.div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={{
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 4: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/espejo/components/HistoryList.tsx frontend/src/espejo/components/EmptyState.tsx frontend/src/espejo/components/SefiraDetailPanel.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(espejo): add HistoryList, EmptyState, SefiraDetailPanel scrollable shell"
```

---

## Task 13: Frontend — EspejoModule (orquestador) + index

**Files:**
- Create: `frontend/src/espejo/EspejoModule.tsx`
- Create: `frontend/src/espejo/index.ts`

- [ ] **Step 1: `EspejoModule.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEspejoSummary } from './hooks/useEspejoSummary';
import { useSefiraData } from './hooks/useSefiraData';
import SefirotInteractiveTree, { type SefiraNode } from './components/SefirotInteractiveTree';
import RotatingReflectionPreview from './components/RotatingReflectionPreview';
import EmptyState from './components/EmptyState';
import SefiraDetailPanel from './components/SefiraDetailPanel';

type Props = {
  sefirot: SefiraNode[];
  glassEffect: string;
};

export default function EspejoModule({ sefirot, glassEffect }: Props) {
  const { summary, reload: reloadSummary } = useEspejoSummary();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { preguntas, registros, reload: reloadSefira } = useSefiraData(selectedId);

  const selectedNode = useMemo(() => sefirot.find(s => s.id === selectedId) ?? null, [sefirot, selectedId]);
  const selectedResumen = useMemo(() => summary.find(s => s.sefira_id === selectedId) ?? null, [summary, selectedId]);

  function handleDataChanged() {
    void reloadSummary();
    void reloadSefira();
  }

  return (
    <div className="w-full max-w-[1400px] flex flex-col md:flex-row items-center md:items-start justify-center gap-10 xl:gap-8 relative">
      <div className="relative shrink-0">
        <SefirotInteractiveTree
          sefirot={sefirot}
          summary={summary}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <RotatingReflectionPreview
          sefirot={sefirot}
          summary={summary}
          active={selectedId === null}
          onSelectSefira={setSelectedId}
        />
      </div>

      <div className="w-full flex-1 max-w-md xl:max-w-lg mt-8 md:mt-0">
        <div className={`p-8 sm:p-10 rounded-3xl min-h-[500px] ${glassEffect}`}>
          <AnimatePresence mode="wait">
            {selectedNode && selectedResumen ? (
              <motion.div
                key={selectedNode.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <SefiraDetailPanel
                  resumen={selectedResumen}
                  description={selectedNode.description}
                  preguntas={preguntas}
                  registros={registros}
                  onDataChanged={handleDataChanged}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <EmptyState />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `index.ts`**

```ts
export { default } from './EspejoModule';
export type { SefiraNode } from './components/SefirotInteractiveTree';
```

- [ ] **Step 3: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/espejo/EspejoModule.tsx frontend/src/espejo/index.ts
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(espejo): add EspejoModule orchestrator + barrel export"
```

---

## Task 14: Integrar EspejoModule en App.tsx + bug del título + transición

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Reemplazar App.tsx**

El archivo actual mezcla App + navegación + Espejo + fetch + slider. Lo simplificamos: deja navegación + render del módulo apropiado.

```tsx
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AdminPanel from "./AdminPanel";
import CalendarModule from "./calendar";
import EspejoModule from "./espejo";

const SEFIROT = [
  { id: "keter",   name: "Kéter",   x: 200, y: 50,  colorClass: "", textClass: "", description: "La Corona. La voluntad primigenia y el vacío puro de donde todo emana." },
  { id: "jojma",   name: "Jojmá",   x: 320, y: 150, colorClass: "", textClass: "", description: "La Sabiduría. El destello inicial de inspiración." },
  { id: "bina",    name: "Biná",    x: 80,  y: 150, colorClass: "", textClass: "", description: "El Entendimiento. La vasija que da estructura." },
  { id: "jesed",   name: "Jésed",   x: 320, y: 280, colorClass: "", textClass: "", description: "La Misericordia. Generosidad y amor incondicional." },
  { id: "gevura",  name: "Gueburá", x: 80,  y: 280, colorClass: "", textClass: "", description: "La Severidad. Rigor y juicio." },
  { id: "tiferet", name: "Tiféret", x: 200, y: 380, colorClass: "", textClass: "", description: "La Belleza. Equilibrio entre Misericordia y Severidad." },
  { id: "netzaj",  name: "Nétsaj",  x: 320, y: 500, colorClass: "", textClass: "", description: "La Victoria. Perseverancia." },
  { id: "hod",     name: "Hod",     x: 80,  y: 500, colorClass: "", textClass: "", description: "El Esplendor. Intelectualidad práctica." },
  { id: "yesod",   name: "Yesod",   x: 200, y: 600, colorClass: "", textClass: "", description: "El Fundamento. La imaginación y el motor psíquico." },
  { id: "maljut",  name: "Maljut",  x: 200, y: 720, colorClass: "", textClass: "", description: "El Reino. La acción física y el mundo material." },
];

type ViewKey = 'espejo' | 'admin' | 'calendario';

const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  espejo:     { title: 'Espejo Cognitivo',       subtitle: 'Reflexión guiada por las dimensiones del alma.' },
  calendario: { title: 'Calendario Cabalístico', subtitle: 'La organización es parte del camino de rectificación. Organiza tu semana y tus dimensiones.' },
  admin:      { title: 'Panel de Administrador', subtitle: 'Gestión de preguntas guía por sefirá.' },
};

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>('espejo');

  const glassEffect = "bg-stone-950/40 backdrop-blur-2xl border border-stone-800/60 shadow-[0_8px_32px_rgba(0,0,0,0.4)]";
  const glowText = "text-amber-100/90 text-shadow-sm";

  const current = VIEW_TITLES[activeView];

  return (
    <div className="min-h-screen bg-[#070709] text-stone-300 font-body flex relative overflow-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-amber-900/10 rounded-full blur-[140px] mix-blend-screen opacity-50"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-[120px] mix-blend-screen opacity-50"></div>
        <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[1000px] h-[1000px] bg-emerald-900/5 rounded-full blur-[150px] mix-blend-screen"></div>
      </div>

      <aside className={`fixed left-0 top-0 h-full w-72 border-r border-stone-800/40 z-40 hidden lg:flex flex-col p-6 transition-all duration-500 ${glassEffect}`}>
        <div className="mt-6 mb-12 px-2">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-8 h-8 rounded-md bg-stone-900/80 border border-stone-700/50 flex items-center justify-center shrink-0 shadow-inner">
               <span className="material-symbols-outlined text-amber-200/90 text-sm">auto_awesome</span>
            </div>
            <h1 className={`text-2xl font-serif tracking-wide ${glowText}`}>Kabbalah Space</h1>
          </div>

          <div className="flex items-center gap-4 mb-10 bg-stone-900/40 p-4 rounded-2xl border border-white/5">
            <div className="w-12 h-12 rounded-full ring-2 ring-stone-700/50 ring-offset-2 ring-offset-[#070709] bg-stone-800 flex items-center justify-center overflow-hidden">
              <span className="material-symbols-outlined text-stone-400">psychology_alt</span>
            </div>
            <div>
              <div className="font-serif text-stone-200 text-sm tracking-wide">Adept Voyager</div>
              <div className="text-[10px] font-mono text-amber-500/70 uppercase tracking-widest mt-1 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-amber-500/70"></span> Level: Yesod
              </div>
            </div>
          </div>

          <nav className="space-y-2">
            {([
              { key: 'espejo', icon: 'account_tree', label: 'Espejo Cognitivo' },
              { key: 'calendario', icon: 'event_note', label: 'Calendario Cabalístico' },
              { key: 'admin', icon: 'admin_panel_settings', label: 'Panel de Administrador' },
            ] as const).map(item => (
              <a
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className={`group flex items-center gap-4 ${activeView === item.key ? 'bg-gradient-to-r from-stone-800/50 to-transparent text-amber-100/90 border-amber-400/50' : 'text-stone-400 border-transparent hover:bg-stone-800/30'} rounded-xl px-4 py-3.5 border-l-2 transition-all duration-300 cursor-pointer`}
                href="#"
              >
                <span className="material-symbols-outlined text-[20px] opacity-80 group-hover:opacity-100 group-hover:text-amber-300 transition-colors">{item.icon}</span>
                <span className="text-sm tracking-wide font-medium">{item.label}</span>
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <main className="lg:ml-72 flex-1 pt-16 relative flex flex-col items-center px-6 min-h-screen mb-10 overflow-auto">
        <header className="w-full max-w-[1400px] 2xl:max-w-[1600px] mb-10 px-4 py-6 text-center">
          <h2 className={`font-serif text-4xl md:text-5xl font-light tracking-tight mb-4 ${glowText}`}>{current.title}</h2>
          <p className="text-stone-400 text-sm md:text-base font-light tracking-wide max-w-2xl mx-auto leading-relaxed">
            {current.subtitle}
          </p>
        </header>

        <section className="w-full max-w-[1400px] 2xl:max-w-[1600px] px-2 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeView === 'admin' && <AdminPanel sefirot={SEFIROT} glowText={glowText} />}
              {activeView === 'calendario' && <CalendarModule sefirot={SEFIROT as any} glowText={glowText} />}
              {activeView === 'espejo' && <EspejoModule sefirot={SEFIROT} glassEffect={glassEffect} />}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
```

Nota: el cast `SEFIROT as any` es para no romper la prop tipada del calendar (`SefiraNode` con `colorClass/textClass`). El calendar no usa esos campos visualmente — se mantiene por compatibilidad pero el tipo es estricto. Es aceptable como puente; si querés tipar limpio hay que tocar también el módulo calendar para flexibilizar el tipo, queda fuera de scope.

- [ ] **Step 2: Type check**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

Esperado: PASS.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/App.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(app): integrate EspejoModule, fix title bug, add inter-view fade transition"
```

---

## Task 15: Verificación end-to-end

**Files:** none (visual + behavioral checks)

- [ ] **Step 1: Build de producción**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npm run build
```

Esperado: success, no errores.

- [ ] **Step 2: Reiniciar servers (si fuera necesario) y probar**

Backend en `127.0.0.1:8000`, frontend dev en `5173` o preview en `4173`.

Con backend corriendo y datos mínimos:

```bash
# Asegurar que jésed tiene al menos 1 pregunta:
curl -s http://127.0.0.1:8000/preguntas/jesed | python -c "import sys,json; d=json.load(sys.stdin); print(f'jesed tiene {len(d)} preguntas')"
# Si == 0, crear:
curl -s -X POST http://127.0.0.1:8000/preguntas -H "Content-Type: application/json" -d '{"sefira_id":"jesed","texto":"¿Cómo manifestaste misericordia?"}'
```

- [ ] **Step 3: Checklist visual en navegador**

Abrir frontend, ir a Espejo Cognitivo:

1. **Header**: dice "Espejo Cognitivo" (no "Calendario Cabalístico").
2. **Sin sefirá seleccionada**: aparece EmptyState a la derecha.
3. **Si hay sefirot con reflexiones**: aparecen susurros flotantes rotando junto a sefirot, ordenados por score IA descendente, ~5s cada uno.
4. **Hover sobre un susurro**: la card queda fija (no rota mientras hoverás).
5. **Click "Ver más" en un susurro**: selecciona esa sefirá, panel detalle aparece.
6. **Click en cualquier orbe del árbol**: el panel directo (sin paso "Iniciar Análisis"). Cards de susurros desaparecen.
7. **Panel detalle**: header con stats (disponibles/total · IA promedio con sparkline · última actividad). Si hay registros, "Tu última reflexión" colapsada. Lista de preguntas guía.
8. **Pregunta nueva (sin respuesta)**: textarea limpio. Escribir y blur → guarda, refresca, queda como "vencida o bloqueada".
9. **Pregunta recién respondida**: panel con candado, "Disponible nuevamente el [fecha]".
10. **Intentar guardar dos veces seguidas**: segunda recibe 409, shake horizontal, mensaje en rojo.
11. **Reflexión global**: slider 1-10, textarea, click "Recibir Diagnóstico IA" → puntos pulsantes mientras carga, luego card amarilla con score y feedback.
12. **Después de evaluar**: el sparkline del header se actualiza, el árbol re-tinta (la sefirá de la nueva entrada brilla más).
13. **Historial colapsado**: si hay más de 1 registro, sección "Ver historial completo (N entradas)" abajo. Click expande lista. Click en una entrada expande inline.
14. **Cambiar a Calendario**: fade simple (180ms), no salto abrupto. Calendario sigue funcionando.
15. **Volver a Espejo**: fade de regreso, susurros reanudan ciclo.
16. **DevTools → reduced motion ON**: sin susurros, sin pulsos, transiciones reducidas.

Si algún ítem falla, anotar y arreglar antes de continuar.

- [ ] **Step 4: Commit final solo si hubo fixes**

Si la verificación reveló bugs y se corrigieron, commit con mensaje `fix:`. Si todo OK, no hace falta commit.

---

## Notas finales

- **Sin migración de DB necesaria** — `RegistroDiario` y `RespuestaPregunta` ya existen.
- **AdminPanel.tsx no se toca** — sigue usando `GET /preguntas/{id}` que se mantiene.
- **App_old.tsx** — fuera de scope.
- **Performance**: `/espejo/resumen` hace ~30 queries para 10 sefirot. Aceptable (~50ms en SQLite local). Si crece a multi-user habrá que optimizar con joins agregados.
- **Cooldown clock**: usa `datetime.utcnow()` server-side. No hay sincronización con la zona del cliente — está bien para single-user, podría ser fuente de bug en multi-tz.
