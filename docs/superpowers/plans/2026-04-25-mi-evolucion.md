# Mi Evolución Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Mi Evolución" view that shows monthly evolution of each sefirá: two curves (Score Usuario in sefirá color + Score IA in golden amber) with a list-left + chart-right layout, range selector (3/6/12/all months), and metric toggle (Both/User/IA).

**Architecture:** Backend adds one aggregating endpoint `GET /espejo/evolucion?meses=N`. Frontend adds a new module `frontend/src/evolucion/` with orchestrator + 8 small components + 1 hook. Pure SVG line chart (no charting library) coherent with existing tree/calendar visuals. New nav item slot in App.tsx between Espejo and Calendario.

**Tech Stack:** FastAPI + SQLAlchemy async + SQLite (existing). React 19 + TypeScript + Framer Motion + date-fns (all existing).

**Spec:** [docs/superpowers/specs/2026-04-25-mi-evolucion-design.md](../specs/2026-04-25-mi-evolucion-design.md)

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `backend/main.py` | Add `MesBucket` + `SefiraEvolucion` Pydantic models + `GET /espejo/evolucion` endpoint |
| Create | `frontend/src/evolucion/types.ts` | TS types `MesBucket`, `SefiraEvolucion`, `Metrics` |
| Create | `frontend/src/evolucion/hooks/useEvolucion.ts` | Fetch `/espejo/evolucion` with `meses` param |
| Create | `frontend/src/evolucion/components/RangeSelector.tsx` | Pill 3 / 6 / 12 / Todo |
| Create | `frontend/src/evolucion/components/MetricToggle.tsx` | Pill Ambos / Usuario / IA |
| Create | `frontend/src/evolucion/components/SefiraEvolucionRow.tsx` | One row of the left list |
| Create | `frontend/src/evolucion/components/SefiraEvolucionList.tsx` | Vertical list of all rows |
| Create | `frontend/src/evolucion/components/EvolucionChartAxis.tsx` | SVG axes + grid + labels |
| Create | `frontend/src/evolucion/components/EvolucionLine.tsx` | One line + its points (with gap handling) |
| Create | `frontend/src/evolucion/components/EvolucionTooltip.tsx` | Hover tooltip card |
| Create | `frontend/src/evolucion/components/EvolucionChart.tsx` | Composes axis + lines + tooltip |
| Create | `frontend/src/evolucion/EvolucionModule.tsx` | Top-level orchestrator |
| Create | `frontend/src/evolucion/index.ts` | Barrel export |
| Modify | `frontend/src/App.tsx` | Add `evolucion` to ViewKey, NAV_ITEMS, VIEW_TITLES, render switch |

---

## Task 1: Backend — `MesBucket` + `SefiraEvolucion` models + endpoint

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add Pydantic models**

Open `backend/main.py`. Find the section where other Pydantic models are defined (after `SefiraResumen`, before the helper functions). Add:

```python
class MesBucket(BaseModel):
    mes: str                                  # YYYY-MM
    score_usuario: Optional[float] = None
    score_ia: Optional[float] = None
    reflexiones: int = 0
    respuestas: int = 0


class SefiraEvolucion(BaseModel):
    sefira_id: str
    sefira_nombre: str
    meses: list[MesBucket]
```

- [ ] **Step 2: Add helper to enumerate month keys**

Just before the `@app.get("/espejo/resumen", ...)` endpoint, add:

```python
def _months_back(today: datetime, count: int) -> list[str]:
    """Return YYYY-MM keys for the last `count` months, oldest first.
    Includes the current month."""
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
```

- [ ] **Step 3: Add the `/espejo/evolucion` endpoint**

Insert this endpoint right after `espejo_resumen`:

```python
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
```

- [ ] **Step 4: Restart backend, verify shape**

Stop the running backend (`taskkill //PID <pid> //F` then start fresh):

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/backend"
source venv/Scripts/activate
uvicorn main:app --host 127.0.0.1 --port 8000
```

Test in another terminal:

```bash
curl -s "http://127.0.0.1:8000/espejo/evolucion?meses=3" | python -c "
import sys, json
d = json.load(sys.stdin)
print(f'sefirot: {len(d)}')
print(f'meses por sefira: {len(d[0][\"meses\"])}')
print('jesed buckets:', [m for m in next(s for s in d if s['sefira_id']=='jesed')['meses']])"
```

Expected: 10 sefirot, 3 meses each. Buckets show mes, score_usuario (likely None or a float), score_ia, reflexiones, respuestas.

If you previously ran the smoke tests and have a Jésed register from `/evaluate`, that bucket should show its score.

- [ ] **Step 5: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add backend/main.py
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(backend): add /espejo/evolucion endpoint with monthly score aggregates"
```

---

## Task 2: Frontend — types + hook

**Files:**
- Create: `frontend/src/evolucion/types.ts`
- Create: `frontend/src/evolucion/hooks/useEvolucion.ts`

- [ ] **Step 1: Create directory + types**

```bash
mkdir -p "c:/Users/123/Desktop/Kabbalah Space/frontend/src/evolucion/hooks"
mkdir -p "c:/Users/123/Desktop/Kabbalah Space/frontend/src/evolucion/components"
```

Create `frontend/src/evolucion/types.ts`:

```ts
export type MesBucket = {
  mes: string;                       // "YYYY-MM"
  score_usuario: number | null;
  score_ia: number | null;
  reflexiones: number;
  respuestas: number;
};

export type SefiraEvolucion = {
  sefira_id: string;
  sefira_nombre: string;
  meses: MesBucket[];
};

export type Metrics = {
  usuario: boolean;
  ia: boolean;
};

export type RangeOption = 3 | 6 | 12 | 'todo';

export const RANGE_TO_MESES: Record<RangeOption, number> = {
  3: 3,
  6: 6,
  12: 12,
  todo: 120,
};
```

- [ ] **Step 2: Create the hook**

Create `frontend/src/evolucion/hooks/useEvolucion.ts`:

```ts
import { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '../../shared/tokens';
import type { SefiraEvolucion, RangeOption } from '../types';
import { RANGE_TO_MESES } from '../types';

export function useEvolucion(range: RangeOption) {
  const [data, setData] = useState<SefiraEvolucion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const meses = RANGE_TO_MESES[range];
      const res = await fetch(`${API_BASE}/espejo/evolucion?meses=${meses}`);
      if (!res.ok) throw new Error('No se pudo cargar la evolución');
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void reload(); }, [reload]);

  return { data, loading, error, reload };
}
```

- [ ] **Step 3: Type check**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npx tsc -b --noEmit
```

Expected: no output (PASS).

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/evolucion/types.ts frontend/src/evolucion/hooks
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(evolucion): add types and useEvolucion hook"
```

---

## Task 3: Frontend — RangeSelector + MetricToggle

**Files:**
- Create: `frontend/src/evolucion/components/RangeSelector.tsx`
- Create: `frontend/src/evolucion/components/MetricToggle.tsx`

- [ ] **Step 1: Create `RangeSelector.tsx`**

```tsx
import { motion } from 'framer-motion';
import type { RangeOption } from '../types';
import { ink } from '../../shared/tokens';

const OPTIONS: { key: RangeOption; label: string }[] = [
  { key: 3,      label: '3M' },
  { key: 6,      label: '6M' },
  { key: 12,     label: '12M' },
  { key: 'todo', label: 'Todo' },
];

type Props = {
  value: RangeOption;
  onChange: (v: RangeOption) => void;
};

export default function RangeSelector({ value, onChange }: Props) {
  return (
    <div className="relative inline-flex items-center rounded-xl bg-[#20242b] border border-stone-700/45 p-1">
      {OPTIONS.map(opt => (
        <button
          key={String(opt.key)}
          type="button"
          onClick={() => onChange(opt.key)}
          className="relative px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.12em] z-10 transition-colors"
          style={{ color: value === opt.key ? '#1c1917' : '#d6d3d1' }}
        >
          {value === opt.key && (
            <motion.span
              layoutId="evolucion-range-pill"
              className="absolute inset-0 rounded-lg"
              style={{ background: ink.ember }}
              transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            />
          )}
          <span className="relative">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `MetricToggle.tsx`**

```tsx
import { motion } from 'framer-motion';
import type { Metrics } from '../types';
import { ink } from '../../shared/tokens';

const OPTIONS: { key: keyof Metrics | 'ambos'; label: string }[] = [
  { key: 'ambos',   label: 'Ambos' },
  { key: 'usuario', label: 'Usuario' },
  { key: 'ia',      label: 'IA' },
];

function activeMode(m: Metrics): 'ambos' | 'usuario' | 'ia' {
  if (m.usuario && m.ia) return 'ambos';
  if (m.usuario) return 'usuario';
  return 'ia';
}

type Props = {
  value: Metrics;
  onChange: (v: Metrics) => void;
};

export default function MetricToggle({ value, onChange }: Props) {
  const mode = activeMode(value);

  function pick(key: 'ambos' | 'usuario' | 'ia') {
    if (key === 'ambos')   onChange({ usuario: true,  ia: true });
    if (key === 'usuario') onChange({ usuario: true,  ia: false });
    if (key === 'ia')      onChange({ usuario: false, ia: true });
  }

  return (
    <div className="relative inline-flex items-center rounded-xl bg-[#20242b] border border-stone-700/45 p-1">
      {OPTIONS.map(opt => (
        <button
          key={opt.key}
          type="button"
          onClick={() => pick(opt.key)}
          className="relative px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.12em] z-10 transition-colors"
          style={{ color: mode === opt.key ? '#1c1917' : '#d6d3d1' }}
        >
          {mode === opt.key && (
            <motion.span
              layoutId="evolucion-metric-pill"
              className="absolute inset-0 rounded-lg"
              style={{ background: ink.ember }}
              transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            />
          )}
          <span className="relative">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/evolucion/components/RangeSelector.tsx frontend/src/evolucion/components/MetricToggle.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(evolucion): add RangeSelector and MetricToggle pills"
```

---

## Task 4: Frontend — SefiraEvolucionRow + List

**Files:**
- Create: `frontend/src/evolucion/components/SefiraEvolucionRow.tsx`
- Create: `frontend/src/evolucion/components/SefiraEvolucionList.tsx`

- [ ] **Step 1: Create `SefiraEvolucionRow.tsx`**

```tsx
import { motion } from 'framer-motion';
import type { SefiraEvolucion, Metrics } from '../types';
import { SEFIRA_COLORS, ink } from '../../shared/tokens';

const SPARK_W = 64;
const SPARK_H = 14;

type Props = {
  data: SefiraEvolucion;
  selected: boolean;
  metrics: Metrics;
  onSelect: () => void;
};

function buildSparklinePath(values: (number | null)[], width: number, height: number): string {
  // Treat nulls as gaps: produce multiple `M ... L ...` subpaths
  const points = values.map((v, i) => {
    const x = (values.length === 1 ? 0 : (i / (values.length - 1)) * width);
    const y = v === null ? null : height - ((v - 1) / 9) * height;
    return { x, y };
  });
  let path = '';
  let pen: 'up' | 'down' = 'up';
  for (const p of points) {
    if (p.y === null) { pen = 'up'; continue; }
    path += pen === 'up' ? `M${p.x.toFixed(1)},${p.y.toFixed(1)} ` : `L${p.x.toFixed(1)},${p.y.toFixed(1)} `;
    pen = 'down';
  }
  return path.trim();
}

export default function SefiraEvolucionRow({ data, selected, metrics, onSelect }: Props) {
  const color = SEFIRA_COLORS[data.sefira_id] ?? '#a3a3a3';
  const lastBucket = [...data.meses].reverse().find(m => m.score_usuario !== null || m.score_ia !== null);
  const lastUsuario = lastBucket?.score_usuario ?? null;
  const lastIa = lastBucket?.score_ia ?? null;

  const usuarioVals = data.meses.map(m => m.score_usuario);
  const iaVals = data.meses.map(m => m.score_ia);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
        selected
          ? 'border-amber-300/40 bg-stone-800/40'
          : 'border-stone-800/50 bg-stone-950/30 hover:bg-stone-900/40'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-xs uppercase tracking-[0.12em] text-stone-200">{data.sefira_nombre}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] tabular-nums">
          {metrics.usuario && (
            <span className="text-stone-200">{lastUsuario !== null ? lastUsuario.toFixed(1) : '—'}</span>
          )}
          {metrics.ia && (
            <span className="text-amber-200/90">{lastIa !== null ? lastIa.toFixed(1) : '—'}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {metrics.usuario && (
          <svg width={SPARK_W} height={SPARK_H} className="block">
            <path d={buildSparklinePath(usuarioVals, SPARK_W, SPARK_H)} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
          </svg>
        )}
        {metrics.ia && (
          <svg width={SPARK_W} height={SPARK_H} className="block">
            <path d={buildSparklinePath(iaVals, SPARK_W, SPARK_H)} fill="none" stroke={ink.ember} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
          </svg>
        )}
        {!metrics.usuario && !metrics.ia && (
          <span className="text-[10px] text-stone-500">Sin métricas activas</span>
        )}
      </div>

      {selected && (
        <motion.div
          layoutId="evolucion-row-marker"
          className="mt-2 h-px w-full"
          style={{ background: `linear-gradient(90deg, ${color}88, transparent)` }}
        />
      )}
    </button>
  );
}
```

- [ ] **Step 2: Create `SefiraEvolucionList.tsx`**

```tsx
import type { SefiraEvolucion, Metrics } from '../types';
import SefiraEvolucionRow from './SefiraEvolucionRow';

type Props = {
  data: SefiraEvolucion[];
  selectedId: string | null;
  metrics: Metrics;
  onSelect: (id: string) => void;
};

export default function SefiraEvolucionList({ data, selectedId, metrics, onSelect }: Props) {
  if (data.length === 0) {
    return <p className="text-xs text-stone-500 italic">Cargando…</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {data.map(s => (
        <SefiraEvolucionRow
          key={s.sefira_id}
          data={s}
          selected={selectedId === s.sefira_id}
          metrics={metrics}
          onSelect={() => onSelect(s.sefira_id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/evolucion/components/SefiraEvolucionRow.tsx frontend/src/evolucion/components/SefiraEvolucionList.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(evolucion): list of sefirot rows with dual sparklines"
```

---

## Task 5: Frontend — Chart axis + line subcomponents

**Files:**
- Create: `frontend/src/evolucion/components/EvolucionChartAxis.tsx`
- Create: `frontend/src/evolucion/components/EvolucionLine.tsx`

- [ ] **Step 1: Create `EvolucionChartAxis.tsx`**

```tsx
type Props = {
  width: number;
  height: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
  monthLabels: string[];     // short labels, in order, length = number of buckets
};

const Y_TICKS = [1, 3, 5, 7, 9];

export default function EvolucionChartAxis({
  width, height, paddingLeft, paddingRight, paddingTop, paddingBottom, monthLabels,
}: Props) {
  const innerW = width - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;

  const xFor = (i: number) =>
    monthLabels.length === 1
      ? paddingLeft + innerW / 2
      : paddingLeft + (i / (monthLabels.length - 1)) * innerW;

  const yFor = (val: number) => paddingTop + innerH - ((val - 1) / 9) * innerH;

  // Reduce X labels if many
  const xLabelStep = monthLabels.length > 10 ? Math.ceil(monthLabels.length / 8) : 1;

  return (
    <g>
      {/* Y grid + labels */}
      {Y_TICKS.map(t => (
        <g key={`yt-${t}`}>
          <line
            x1={paddingLeft} x2={width - paddingRight}
            y1={yFor(t)} y2={yFor(t)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />
          <text
            x={paddingLeft - 8} y={yFor(t)}
            textAnchor="end"
            dominantBaseline="central"
            fill="rgba(168,162,158,0.7)"
            style={{ fontSize: 10, fontFamily: 'monospace' }}
          >
            {t}
          </text>
        </g>
      ))}

      {/* X labels */}
      {monthLabels.map((lbl, i) => {
        if (i % xLabelStep !== 0 && i !== monthLabels.length - 1) return null;
        return (
          <text
            key={`xl-${i}`}
            x={xFor(i)} y={height - paddingBottom + 16}
            textAnchor="middle"
            fill="rgba(168,162,158,0.7)"
            style={{ fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}
          >
            {lbl}
          </text>
        );
      })}

      {/* Axis baseline */}
      <line
        x1={paddingLeft} x2={width - paddingRight}
        y1={height - paddingBottom} y2={height - paddingBottom}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1}
      />
    </g>
  );
}
```

- [ ] **Step 2: Create `EvolucionLine.tsx`**

```tsx
import { motion } from 'framer-motion';

type Props = {
  values: (number | null)[];
  color: string;
  visible: boolean;
  width: number;
  height: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
  layoutKey: string;          // for AnimatePresence pathLength reset on switch
};

function buildPath(values: (number | null)[], xFor: (i: number) => number, yFor: (v: number) => number): string {
  let path = '';
  let pen: 'up' | 'down' = 'up';
  values.forEach((v, i) => {
    if (v === null) { pen = 'up'; return; }
    const x = xFor(i);
    const y = yFor(v);
    path += pen === 'up' ? `M${x.toFixed(2)},${y.toFixed(2)} ` : `L${x.toFixed(2)},${y.toFixed(2)} `;
    pen = 'down';
  });
  return path.trim();
}

export default function EvolucionLine({
  values, color, visible, width, height,
  paddingLeft, paddingRight, paddingTop, paddingBottom, layoutKey,
}: Props) {
  if (!visible) return null;

  const innerW = width - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;
  const xFor = (i: number) =>
    values.length === 1 ? paddingLeft + innerW / 2 : paddingLeft + (i / (values.length - 1)) * innerW;
  const yFor = (v: number) => paddingTop + innerH - ((v - 1) / 9) * innerH;

  const path = buildPath(values, xFor, yFor);

  return (
    <g>
      <motion.path
        key={layoutKey + '-path'}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          pathLength: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
          opacity:    { duration: 0.2 },
        }}
      />
      {values.map((v, i) => {
        if (v === null) return null;
        return (
          <motion.circle
            key={`${layoutKey}-pt-${i}`}
            cx={xFor(i)}
            cy={yFor(v)}
            r={3.5}
            fill={color}
            stroke="#0e1014"
            strokeWidth={1.5}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.6 + i * 0.02 }}
            style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
          />
        );
      })}
    </g>
  );
}
```

- [ ] **Step 3: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/evolucion/components/EvolucionChartAxis.tsx frontend/src/evolucion/components/EvolucionLine.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(evolucion): chart axis + animated line subcomponents"
```

---

## Task 6: Frontend — Chart tooltip + composed Chart

**Files:**
- Create: `frontend/src/evolucion/components/EvolucionTooltip.tsx`
- Create: `frontend/src/evolucion/components/EvolucionChart.tsx`

- [ ] **Step 1: Create `EvolucionTooltip.tsx`**

```tsx
import { motion } from 'framer-motion';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import type { MesBucket } from '../types';

type Props = {
  bucket: MesBucket;
  x: number;     // pixel x within parent
  color: string; // sefirá color, used for the user score
};

function monthLabel(mesKey: string): string {
  const d = parse(`${mesKey}-01`, 'yyyy-MM-dd', new Date());
  const txt = format(d, "MMMM yyyy", { locale: es });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export default function EvolucionTooltip({ bucket, x, color }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="absolute pointer-events-none z-20 bg-[#0e1014]/95 backdrop-blur-md border border-stone-700/50 rounded-lg px-3 py-2 shadow-xl"
      style={{ left: x, top: 8, transform: 'translateX(-50%)', minWidth: 160 }}
    >
      <p className="text-[10px] uppercase tracking-[0.14em] text-stone-300 mb-1.5">{monthLabel(bucket.mes)}</p>
      <div className="flex items-center justify-between gap-3 text-[11px] mb-1">
        <span className="flex items-center gap-1.5 text-stone-300">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /> Usuario
        </span>
        <span className="tabular-nums" style={{ color }}>
          {bucket.score_usuario !== null ? bucket.score_usuario.toFixed(1) : '—'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] mb-2">
        <span className="flex items-center gap-1.5 text-stone-300">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-300" /> IA
        </span>
        <span className="tabular-nums text-amber-200/90">
          {bucket.score_ia !== null ? bucket.score_ia.toFixed(1) : '—'}
        </span>
      </div>
      <div className="text-[9px] text-stone-500 uppercase tracking-wider border-t border-stone-800/70 pt-1.5">
        {bucket.reflexiones} reflexión{bucket.reflexiones === 1 ? '' : 'es'} · {bucket.respuestas} respuesta{bucket.respuestas === 1 ? '' : 's'}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create `EvolucionChart.tsx`**

```tsx
import { useState, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SefiraEvolucion, Metrics } from '../types';
import { SEFIRA_COLORS, ink } from '../../shared/tokens';
import EvolucionChartAxis from './EvolucionChartAxis';
import EvolucionLine from './EvolucionLine';
import EvolucionTooltip from './EvolucionTooltip';

const W = 600;
const H = 320;
const PL = 38;
const PR = 12;
const PT = 14;
const PB = 28;

type Props = {
  data: SefiraEvolucion;
  metrics: Metrics;
};

function shortMonthLabel(mesKey: string): string {
  const d = parse(`${mesKey}-01`, 'yyyy-MM-dd', new Date());
  return format(d, 'MMM', { locale: es }).toUpperCase();
}

export default function EvolucionChart({ data, metrics }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const color = SEFIRA_COLORS[data.sefira_id] ?? '#a3a3a3';
  const labels = useMemo(() => data.meses.map(m => shortMonthLabel(m.mes)), [data.meses]);
  const usuarioVals = useMemo(() => data.meses.map(m => m.score_usuario), [data.meses]);
  const iaVals = useMemo(() => data.meses.map(m => m.score_ia), [data.meses]);

  const innerW = W - PL - PR;
  const xFor = (i: number) =>
    data.meses.length === 1 ? PL + innerW / 2 : PL + (i / (data.meses.length - 1)) * innerW;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = (px - PL) / innerW;
    const idx = Math.round(ratio * (data.meses.length - 1));
    if (idx >= 0 && idx < data.meses.length) setHoverIdx(idx);
  }

  function handleLeave() { setHoverIdx(null); }

  const allEmpty = usuarioVals.every(v => v === null) && iaVals.every(v => v === null);

  if (allEmpty) {
    return (
      <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-stone-400 text-sm font-serif italic text-center px-6">
            Aún sin reflexiones para esta dimensión en el rango elegido.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full block"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        <EvolucionChartAxis
          width={W} height={H}
          paddingLeft={PL} paddingRight={PR} paddingTop={PT} paddingBottom={PB}
          monthLabels={labels}
        />
        <EvolucionLine
          values={usuarioVals}
          color={color}
          visible={metrics.usuario}
          width={W} height={H}
          paddingLeft={PL} paddingRight={PR} paddingTop={PT} paddingBottom={PB}
          layoutKey={`${data.sefira_id}-usuario`}
        />
        <EvolucionLine
          values={iaVals}
          color={ink.ember}
          visible={metrics.ia}
          width={W} height={H}
          paddingLeft={PL} paddingRight={PR} paddingTop={PT} paddingBottom={PB}
          layoutKey={`${data.sefira_id}-ia`}
        />

        {hoverIdx !== null && (
          <line
            x1={xFor(hoverIdx)} x2={xFor(hoverIdx)}
            y1={PT} y2={H - PB}
            stroke="rgba(253,230,138,0.25)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
      </svg>

      <AnimatePresence>
        {hoverIdx !== null && (
          <EvolucionTooltip
            bucket={data.meses[hoverIdx]}
            x={(xFor(hoverIdx) / W) * 100 / 100 * (svgRef.current?.clientWidth ?? W)}
            color={color}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 3: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/evolucion/components/EvolucionTooltip.tsx frontend/src/evolucion/components/EvolucionChart.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(evolucion): EvolucionChart with hover tooltip + crosshair"
```

---

## Task 7: Frontend — EvolucionModule + barrel

**Files:**
- Create: `frontend/src/evolucion/EvolucionModule.tsx`
- Create: `frontend/src/evolucion/index.ts`

- [ ] **Step 1: Create `EvolucionModule.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Metrics, RangeOption } from './types';
import { useEvolucion } from './hooks/useEvolucion';
import RangeSelector from './components/RangeSelector';
import MetricToggle from './components/MetricToggle';
import SefiraEvolucionList from './components/SefiraEvolucionList';
import EvolucionChart from './components/EvolucionChart';

const ease = [0.16, 1, 0.3, 1] as const;

export default function EvolucionModule() {
  const [range, setRange] = useState<RangeOption>(12);
  const [metrics, setMetrics] = useState<Metrics>({ usuario: true, ia: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, loading, error } = useEvolucion(range);

  // Default selection: first sefirá with at least one register, fallback to first in list
  useEffect(() => {
    if (selectedId !== null) return;
    if (data.length === 0) return;
    const withData = data.find(s => s.meses.some(m => m.score_usuario !== null || m.score_ia !== null));
    setSelectedId((withData ?? data[0]).sefira_id);
  }, [data, selectedId]);

  const selected = useMemo(
    () => data.find(s => s.sefira_id === selectedId) ?? null,
    [data, selectedId]
  );

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
      {/* Left: list */}
      <div className="lg:col-span-4 w-full bg-[#15181d] border border-stone-700/40 rounded-[2rem] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs uppercase tracking-[0.16em] text-stone-300">Dimensiones</h3>
          <RangeSelector value={range} onChange={setRange} />
        </div>
        {error && <p className="text-red-300 text-sm mb-3">{error}</p>}
        <SefiraEvolucionList
          data={data}
          selectedId={selectedId}
          metrics={metrics}
          onSelect={setSelectedId}
        />
      </div>

      {/* Right: chart */}
      <div className="lg:col-span-8 w-full bg-[#15181d] border border-stone-700/40 rounded-[2rem] p-6 md:p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-5 gap-4">
          <div>
            <h2 className="font-serif text-3xl text-amber-100/90 tracking-tight">
              {selected?.sefira_nombre ?? '—'}
            </h2>
            <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400 mt-1">
              Evolución mensual
            </p>
          </div>
          <MetricToggle value={metrics} onChange={setMetrics} />
        </div>

        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={selected.sefira_id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease }}
            >
              <EvolucionChart data={selected} metrics={metrics} />
            </motion.div>
          ) : (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-stone-400 text-sm font-serif italic text-center py-12"
            >
              {loading ? 'Cargando…' : 'Seleccioná una dimensión a la izquierda'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `index.ts`**

```ts
export { default } from './EvolucionModule';
```

- [ ] **Step 3: Type check + commit**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/evolucion/EvolucionModule.tsx frontend/src/evolucion/index.ts
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(evolucion): EvolucionModule orchestrator + barrel"
```

---

## Task 8: Wire it into App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add ViewKey + import**

In `frontend/src/App.tsx`, find the imports at the top and add:

```tsx
import EvolucionModule from "./evolucion";
```

Find `type ViewKey = ...` and replace with:

```tsx
type ViewKey = 'espejo' | 'admin' | 'calendario' | 'evolucion';
```

- [ ] **Step 2: Add to VIEW_TITLES**

Find the `VIEW_TITLES` const and add the `evolucion` entry:

```tsx
const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  espejo:     { title: 'Mi Árbol de la Vida',    subtitle: 'Reflexión guiada por las dimensiones del alma.' },
  evolucion:  { title: 'Mi Evolución',            subtitle: 'El movimiento mensual de cada dimensión del alma.' },
  calendario: { title: 'Calendario Cabalístico', subtitle: 'La organización es parte del camino de rectificación. Organiza tu semana y tus dimensiones.' },
  admin:      { title: 'Panel de Administrador', subtitle: 'Gestión de preguntas guía por sefirá.' },
};
```

- [ ] **Step 3: Add to NAV_ITEMS**

Find `NAV_ITEMS` and add the new item between Espejo and Calendario:

```tsx
const NAV_ITEMS = [
  { key: 'espejo' as ViewKey,     icon: 'account_tree',           label: 'Mi Árbol de la Vida' },
  { key: 'evolucion' as ViewKey,  icon: 'monitoring',              label: 'Mi Evolución' },
  { key: 'calendario' as ViewKey, icon: 'event_note',              label: 'Calendario Cabalístico' },
  { key: 'admin' as ViewKey,      icon: 'admin_panel_settings',    label: 'Panel de Administrador' },
];
```

- [ ] **Step 4: Render EvolucionModule in the section switch**

Find the AnimatePresence block in the `<section>` and add the evolucion case:

```tsx
{activeView === 'admin' && <AdminPanel sefirot={SEFIROT} glowText={glowText} />}
{activeView === 'calendario' && <CalendarModule sefirot={SEFIROT as any} glowText={glowText} />}
{activeView === 'evolucion' && <EvolucionModule />}
{activeView === 'espejo' && (
  <EspejoModule
    sefirot={SEFIROT}
    glassEffect={glassEffect}
    introPlaying={introPlaying}
    pageRevealed={pageRevealed}
    onIntroComplete={handleIntroComplete}
  />
)}
```

- [ ] **Step 5: Type check**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/App.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(app): wire Mi Evolucion view into nav, titles and section switch"
```

---

## Task 9: Production build + visual verification

**Files:** none (visual checks)

- [ ] **Step 1: Production build**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npm run build
```

Expected: `✓ built in <Nms>`. No TS errors.

- [ ] **Step 2: Restart preview**

```bash
# kill old preview if running
netstat -ano | grep ":4173" | grep LISTENING | awk '{print $5}' | head -1 | xargs -I {} taskkill //PID {} //F
cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npm run preview -- --port 4173
```

In another check, ensure backend is up at `127.0.0.1:8000`.

- [ ] **Step 3: Manual visual checklist**

Open `http://localhost:4173`. Click the new "Mi Evolución" icon (4th in the rail).

Verify:

1. Header: "Mi Evolución" + subtitle "El movimiento mensual de cada dimensión del alma."
2. Layout: list of 10 sefirot on the left + big chart panel on the right.
3. Each row in the list has: dot (color) · name uppercase · last user score · last IA score · two sparklines (color sefirá + dorado).
4. Default selection is a sefirá with at least one register (likely Jésed or Kéter from earlier smoke tests).
5. Range selector works: clicking 3M / 6M / 12M / Todo refetches and chart resizes.
6. Metric toggle: clicking "Usuario" hides golden line; "IA" hides colored line; "Ambos" shows both. Same effect propagates to sparklines in the list.
7. Chart Y axis ticks at 1, 3, 5, 7, 9 with grid lines; X axis with month labels (ENE, FEB, …).
8. Hover on chart: vertical dashed line + tooltip card showing month, both scores, reflexiones count, respuestas count.
9. Months without data: line is broken (no spurious interpolation).
10. Selecting a different sefirá: chart re-animates with pathLength sweep + points appearing in cascade.

If any item fails, note it and fix before considering complete.

- [ ] **Step 4: No-op commit only if fixes were made**

If you patched anything during the visual check, commit with a `fix:` message.

---

## Notes

- The endpoint reuses existing tables (`registros_diario`, `respuestas_preguntas`, `preguntas_sefirot`); no DB migration needed.
- The chart uses pure SVG with simple `<path d="M...L...">` line segments. No Catmull-Rom or smoothing — kept literal so the data is faithful.
- Animations on `pathLength` are GPU-friendly. Points have a tiny per-index delay so they appear in cascade after the line draws.
- If you later want to render multiple sefirot on the same chart, the existing `EvolucionLine` component can be instantiated multiple times — but per the spec, that's out of scope.
