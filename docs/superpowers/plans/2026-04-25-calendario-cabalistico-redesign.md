# Rediseño Calendario Cabalístico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar `frontend/src/CalendarModule.tsx` (829 líneas, basado en `react-big-calendar`) por un módulo modular en `frontend/src/calendar/` con calendario custom, animaciones de Framer Motion, árbol Sefirótico respirante y panel lateral con spring physics. Estética "Templo digital".

**Architecture:** Decomposición en 16 archivos bajo `frontend/src/calendar/` (orquestador + 3 vistas + 6 componentes + 2 hooks + 2 archivos de motion + tokens + types + barrel). Migración incremental: el código nuevo convive con el viejo hasta el switch final en `App.tsx`. Sin TDD — el proyecto no tiene infraestructura de tests y el alcance es 95% visual; verificación vía TypeScript + dev server.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind 4, Framer Motion 11 (nueva), date-fns 4 (existente), lucide-react (existente).

**Spec de referencia:** [docs/superpowers/specs/2026-04-25-calendario-cabalistico-redesign-design.md](../specs/2026-04-25-calendario-cabalistico-redesign-design.md)

---

## File Structure

| Acción | Path | Responsabilidad |
|---|---|---|
| Modificar | `frontend/package.json` | Añadir `framer-motion` |
| Crear | `frontend/src/calendar/tokens.ts` | Color, motion timings, spacing |
| Crear | `frontend/src/calendar/types.ts` | Tipos TS compartidos |
| Crear | `frontend/src/calendar/motion/transitions.ts` | Variants reutilizables |
| Crear | `frontend/src/calendar/motion/breath.ts` | Variants de respiración |
| Crear | `frontend/src/calendar/hooks/useCalendarRange.ts` | visibleStart/end + nav |
| Crear | `frontend/src/calendar/hooks/useActivities.ts` | fetch actividades + volumen |
| Crear | `frontend/src/calendar/components/CalendarToolbar.tsx` | Header + selector vista |
| Crear | `frontend/src/calendar/components/CalendarEvent.tsx` | Chip de evento animado |
| Crear | `frontend/src/calendar/views/WeekView.tsx` | Grid 7×24 |
| Crear | `frontend/src/calendar/views/MonthView.tsx` | Grid 7×6 |
| Crear | `frontend/src/calendar/views/YearView.tsx` | Grid 3×4 mini-cards |
| Crear | `frontend/src/calendar/views/ViewMorph.tsx` | Wrapper de transición |
| Crear | `frontend/src/calendar/components/SefirotTree.tsx` | Árbol con respiración |
| Crear | `frontend/src/calendar/components/SefirotLegend.tsx` | Lista vertical compacta |
| Crear | `frontend/src/calendar/components/ActivityForm.tsx` | Formulario interno |
| Crear | `frontend/src/calendar/components/ActivityPanel.tsx` | Panel lateral spring |
| Crear | `frontend/src/calendar/CalendarModule.tsx` | Orquestador (~150 líneas) |
| Crear | `frontend/src/calendar/index.ts` | Barrel export |
| Modificar | `frontend/src/App.tsx:3` | Cambiar import a `./calendar` |
| Borrar | `frontend/src/CalendarModule.tsx` | Versión vieja |
| Modificar | `frontend/src/index.css:110-211` | Quitar `.rbc-theme` rules |
| Modificar | `frontend/package.json` | Quitar `react-big-calendar`, `@types/react-big-calendar` |

---

## Task 1: Setup de dependencias y tokens

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/calendar/tokens.ts`
- Create: `frontend/src/calendar/types.ts`

- [ ] **Step 1: Instalar framer-motion**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npm install framer-motion@^11.18.0
```

Expected: `+ framer-motion@11.x.x added`

- [ ] **Step 2: Crear `frontend/src/calendar/tokens.ts`**

```ts
export const ink = {
  void:      '#0e1014',
  obsidian:  '#15181d',
  basalt:    '#1b1f25',
  ash:       '#252a32',
  bone:      'rgba(245,243,235,0.92)',
  ember:     '#e9c349',
  emberSoft: 'rgba(233,195,73,0.18)',
  border:    'rgba(120,120,120,0.18)',
} as const;

export const motion = {
  swift:   { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  flowing: { duration: 0.6,  ease: [0.16, 1, 0.3, 1] as const },
  unveil:  { duration: 0.9,  ease: [0.16, 1, 0.3, 1] as const },
  breath:  { duration: 8,    ease: 'easeInOut' as const, repeat: Infinity, repeatType: 'mirror' as const },
  stagger: 0.04,
} as const;

export const space = { xs: 4, sm: 8, md: 13, lg: 21, xl: 34, xxl: 55 } as const;

export const SEFIRA_COLORS: Record<string, string> = {
  keter: '#d1d5db',
  jojma: '#9ca3af',
  bina: '#71717a',
  jesed: '#3b82f6',
  gevura: '#ef4444',
  tiferet: '#f59e0b',
  netzaj: '#10b981',
  hod: '#f97316',
  yesod: '#8b5cf6',
  maljut: '#a16207',
};

export const CONNECTIONS: { n1: string; n2: string }[] = [
  { n1: 'keter',   n2: 'jojma'   }, { n1: 'keter',   n2: 'bina'    },
  { n1: 'keter',   n2: 'tiferet' }, { n1: 'jojma',   n2: 'bina'    },
  { n1: 'jojma',   n2: 'tiferet' }, { n1: 'bina',    n2: 'tiferet' },
  { n1: 'jojma',   n2: 'jesed'   }, { n1: 'bina',    n2: 'gevura'  },
  { n1: 'jesed',   n2: 'netzaj'  }, { n1: 'gevura',  n2: 'hod'     },
  { n1: 'jesed',   n2: 'gevura'  }, { n1: 'netzaj',  n2: 'hod'     },
  { n1: 'jesed',   n2: 'tiferet' }, { n1: 'gevura',  n2: 'tiferet' },
  { n1: 'netzaj',  n2: 'tiferet' }, { n1: 'hod',     n2: 'tiferet' },
  { n1: 'yesod',   n2: 'tiferet' }, { n1: 'netzaj',  n2: 'yesod'   },
  { n1: 'hod',     n2: 'yesod'   }, { n1: 'netzaj',  n2: 'maljut'  },
  { n1: 'hod',     n2: 'maljut'  }, { n1: 'yesod',   n2: 'maljut'  },
];

export const API_BASE = 'http://127.0.0.1:8000';
```

- [ ] **Step 3: Crear `frontend/src/calendar/types.ts`**

```ts
export type SefiraNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  colorClass: string;
  textClass: string;
  description?: string;
};

export type ActivitySefira = {
  id: string;
  nombre: string;
};

export type Activity = {
  id: string;
  titulo: string;
  descripcion: string | null;
  inicio: string;
  fin: string;
  estado: string;
  sefirot: ActivitySefira[];
};

export type VolumeItem = {
  sefira_id: string;
  sefira_nombre: string;
  horas_total: number;
  actividades_total: number;
};

export type CalendarView = 'semana' | 'mes' | 'anio';

export type DateRange = { start: Date; end: Date };
```

- [ ] **Step 4: Verificar que TypeScript compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS (sin errores)

- [ ] **Step 5: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/package.json frontend/package-lock.json frontend/src/calendar/tokens.ts frontend/src/calendar/types.ts
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add framer-motion + design tokens + shared types"
```

---

## Task 2: Variants de Framer Motion

**Files:**
- Create: `frontend/src/calendar/motion/transitions.ts`
- Create: `frontend/src/calendar/motion/breath.ts`

- [ ] **Step 1: Crear `frontend/src/calendar/motion/transitions.ts`**

```ts
import type { Variants, Transition } from 'framer-motion';
import { motion as M } from '../tokens';

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: M.flowing },
  exit:    { opacity: 0, y: -8, transition: M.swift },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: M.flowing },
  exit:    { opacity: 0, transition: M.swift },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: M.flowing },
  exit:    { opacity: 0, scale: 0.96, transition: M.swift },
};

export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: M.stagger } },
};

export const eventChip: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: M.unveil },
  exit:    { opacity: 0, scale: 0.97, transition: M.swift },
};

export const panelSpring: Transition = {
  type: 'spring',
  damping: 28,
  stiffness: 220,
};

export const panelExit: Transition = M.flowing;
```

- [ ] **Step 2: Crear `frontend/src/calendar/motion/breath.ts`**

```ts
import type { Variants } from 'framer-motion';
import { motion as M } from '../tokens';

export const breathScale: Variants = {
  animate: {
    scale: [1, 1.025, 1],
    transition: M.breath,
  },
};

export const breathHalo: Variants = {
  animate: {
    opacity: [0.4, 0.7, 0.4],
    transition: { ...M.breath, delay: 2 },
  },
};

export const breathRing: Variants = {
  animate: {
    opacity: [0.5, 1, 0.5],
    transition: M.breath,
  },
};

export const breathFast: Variants = {
  animate: {
    opacity: [0.6, 1, 0.6],
    transition: { duration: 3, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' },
  },
};

export function randomBreathDelay(): number {
  return Math.random() * 2;
}
```

- [ ] **Step 3: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/motion
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add framer-motion variants for transitions and breath"
```

---

## Task 3: Hooks (rango y datos)

**Files:**
- Create: `frontend/src/calendar/hooks/useCalendarRange.ts`
- Create: `frontend/src/calendar/hooks/useActivities.ts`

- [ ] **Step 1: Crear `frontend/src/calendar/hooks/useCalendarRange.ts`**

```ts
import { useMemo, useState, useCallback } from 'react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addMonths, addYears } from 'date-fns';
import type { CalendarView, DateRange } from '../types';

export function useCalendarRange(initialDate: Date = new Date()) {
  const [anchor, setAnchor] = useState<Date>(initialDate);
  const [view, setView] = useState<CalendarView>('semana');

  const range = useMemo<DateRange>(() => {
    if (view === 'semana') {
      return {
        start: startOfWeek(anchor, { weekStartsOn: 1 }),
        end:   endOfWeek(anchor,   { weekStartsOn: 1 }),
      };
    }
    if (view === 'mes') {
      const monthStart = startOfMonth(anchor);
      const monthEnd   = endOfMonth(anchor);
      return {
        start: startOfWeek(monthStart, { weekStartsOn: 1 }),
        end:   addDays(startOfWeek(monthStart, { weekStartsOn: 1 }), 41),
      };
    }
    return {
      start: new Date(anchor.getFullYear(), 0, 1, 0, 0, 0),
      end:   new Date(anchor.getFullYear(), 11, 31, 23, 59, 59),
    };
  }, [anchor, view]);

  const goPrev = useCallback(() => {
    setAnchor(prev => {
      if (view === 'semana') return addDays(prev, -7);
      if (view === 'mes')    return addMonths(prev, -1);
      return addYears(prev, -1);
    });
  }, [view]);

  const goNext = useCallback(() => {
    setAnchor(prev => {
      if (view === 'semana') return addDays(prev, 7);
      if (view === 'mes')    return addMonths(prev, 1);
      return addYears(prev, 1);
    });
  }, [view]);

  const goToday = useCallback(() => setAnchor(new Date()), []);

  return { anchor, setAnchor, view, setView, range, goPrev, goNext, goToday };
}
```

- [ ] **Step 2: Crear `frontend/src/calendar/hooks/useActivities.ts`**

```ts
import { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '../tokens';
import type { Activity, VolumeItem, DateRange } from '../types';

function dateToYmd(d: Date): string {
  const offset = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return offset.toISOString().slice(0, 10);
}

export function useActivities(range: DateRange) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [volume, setVolume] = useState<VolumeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const startDate = new Date(range.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(range.end);
      endDate.setDate(endDate.getDate() + 1);
      endDate.setHours(0, 0, 0, 0);

      const [actRes, volRes] = await Promise.all([
        fetch(`${API_BASE}/actividades?start=${encodeURIComponent(startDate.toISOString())}&end=${encodeURIComponent(endDate.toISOString())}`),
        fetch(`${API_BASE}/energia/volumen-semanal?fecha=${dateToYmd(range.start)}`),
      ]);

      if (!actRes.ok) throw new Error('No se pudieron cargar actividades');
      if (!volRes.ok) throw new Error('No se pudo cargar el volumen energético');

      const actData = await actRes.json();
      const volData = await volRes.json();
      setActivities(actData);
      setVolume(volData.volumen ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end]);

  useEffect(() => {
    load();
  }, [load]);

  return { activities, volume, loading, error, reload: load, setError };
}
```

- [ ] **Step 3: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/hooks
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add useCalendarRange and useActivities hooks"
```

---

## Task 4: CalendarToolbar (header + selector deslizante)

**Files:**
- Create: `frontend/src/calendar/components/CalendarToolbar.tsx`

- [ ] **Step 1: Crear `frontend/src/calendar/components/CalendarToolbar.tsx`**

```tsx
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { CalendarView } from '../types';
import { ink } from '../tokens';

const VIEW_OPTIONS: { key: CalendarView; label: string }[] = [
  { key: 'semana', label: 'Semana' },
  { key: 'mes',    label: 'Mes' },
  { key: 'anio',   label: 'Año' },
];

type Props = {
  date: Date;
  view: CalendarView;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  onCreate: () => void;
};

export default function CalendarToolbar({ date, view, onPrev, onNext, onToday, onViewChange, onCreate }: Props) {
  let title = '';
  let subtitle = '';

  if (view === 'semana') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    title = format(date, 'MMMM', { locale: es });
    subtitle = `Semana del ${format(start, 'd', { locale: es })} al ${format(end, "d 'de' MMMM", { locale: es })}`;
  } else if (view === 'mes') {
    title = format(date, 'MMMM', { locale: es });
    subtitle = format(date, 'yyyy');
  } else {
    title = format(date, 'yyyy');
    subtitle = 'Vista anual';
  }

  const titleCapitalized = title.charAt(0).toUpperCase() + title.slice(1);

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
      <div className="flex items-end gap-5">
        <div>
          <h2 className="text-3xl md:text-4xl font-serif tracking-tight text-amber-100/90">{titleCapitalized}</h2>
          <p className="text-[10px] text-stone-400 uppercase tracking-[0.16em] mt-1">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onToday}
          className="text-[10px] uppercase tracking-[0.18em] text-stone-400 hover:text-amber-200 transition-colors pb-2"
        >
          Hoy
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap justify-end">
        <div className="relative flex items-center rounded-xl bg-[#20242b] border border-stone-700/45 p-1">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onViewChange(opt.key)}
              className="relative px-4 py-1.5 rounded-lg text-[11px] uppercase tracking-[0.12em] z-10 transition-colors"
              style={{ color: view === opt.key ? '#1c1917' : '#d6d3d1' }}
            >
              {view === opt.key && (
                <motion.span
                  layoutId="view-pill"
                  className="absolute inset-0 rounded-lg"
                  style={{ background: ink.ember }}
                  transition={{ type: 'spring', damping: 24, stiffness: 280 }}
                />
              )}
              <span className="relative">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ x: -2 }}
            transition={{ duration: 0.2 }}
            onClick={onPrev}
            className="w-10 h-10 rounded-full bg-[#1b1f26] hover:bg-[#252830] border border-stone-700/50 text-stone-300 flex items-center justify-center"
            aria-label="Anterior"
          >
            <ChevronLeft size={18} />
          </motion.button>
          <motion.button
            whileHover={{ x: 2 }}
            transition={{ duration: 0.2 }}
            onClick={onNext}
            className="w-10 h-10 rounded-full bg-[#1b1f26] hover:bg-[#252830] border border-stone-700/50 text-stone-300 flex items-center justify-center"
            aria-label="Siguiente"
          >
            <ChevronRight size={18} />
          </motion.button>
        </div>

        <button
          type="button"
          onClick={onCreate}
          className="px-4 py-2.5 rounded-xl bg-amber-300 text-stone-900 text-xs font-semibold tracking-[0.18em] uppercase hover:bg-amber-200 transition-colors"
        >
          Crear actividad
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/components/CalendarToolbar.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add CalendarToolbar with sliding view pill"
```

---

## Task 5: CalendarEvent (chip animado)

**Files:**
- Create: `frontend/src/calendar/components/CalendarEvent.tsx`

- [ ] **Step 1: Crear `frontend/src/calendar/components/CalendarEvent.tsx`**

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
      style={{ background: `${color}33`, borderLeft: `2px solid ${color}` }}
    >
      {activity.titulo}
    </motion.div>
  );
}
```

- [ ] **Step 2: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/components/CalendarEvent.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add CalendarEvent chip with layoutId animation"
```

---

## Task 6: WeekView

**Files:**
- Create: `frontend/src/calendar/views/WeekView.tsx`

- [ ] **Step 1: Crear `frontend/src/calendar/views/WeekView.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { startOfWeek, addDays, format, isSameDay, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Activity } from '../types';
import { ink } from '../tokens';
import { breathRing } from '../motion/breath';
import { staggerContainer } from '../motion/transitions';
import CalendarEvent from '../components/CalendarEvent';

const HOUR_HEIGHT = 56;
const HOUR_START = 6;
const HOUR_END = 23;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

type Props = {
  date: Date;
  activities: Activity[];
  onSlotClick?: (start: Date, end: Date) => void;
  onEventClick?: (a: Activity) => void;
};

export default function WeekView({ date, activities, onSlotClick, onEventClick }: Props) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const eventsByDay = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    for (const day of days) map[format(day, 'yyyy-MM-dd')] = [];
    for (const act of activities) {
      const key = format(new Date(act.inicio), 'yyyy-MM-dd');
      if (map[key]) map[key].push(act);
    }
    return map;
  }, [activities, days]);

  const nowOffsetPx =
    isSameDay(now, weekStart) || days.some(d => isSameDay(d, now))
      ? (now.getHours() - HOUR_START) * HOUR_HEIGHT + (now.getMinutes() / 60) * HOUR_HEIGHT
      : -1;

  const todayIdx = days.findIndex(d => isSameDay(d, now));

  function handleSlotClick(day: Date, hour: number) {
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1);
    onSlotClick?.(start, end);
  }

  function eventStyle(act: Activity): React.CSSProperties {
    const startD = new Date(act.inicio);
    const endD = new Date(act.fin);
    const top = (startD.getHours() - HOUR_START) * HOUR_HEIGHT + (startD.getMinutes() / 60) * HOUR_HEIGHT;
    const heightHrs = Math.max(0.5, (endD.getTime() - startD.getTime()) / 3600000);
    const height = heightHrs * HOUR_HEIGHT - 4;
    return { top, height, left: 4, right: 4 };
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}>
      <div />
      {days.map(day => {
        const isToday = isSameDay(day, now);
        const dayShort = format(day, 'EEE', { locale: es }).slice(0, 3).toUpperCase();
        return (
          <div key={day.toISOString()} className="flex flex-col items-center justify-center py-2 border-b border-stone-800/40">
            <span className={`text-[10px] uppercase tracking-[0.12em] ${isToday ? 'text-amber-300 font-bold' : 'text-stone-400'}`}>{dayShort}</span>
            <div className="relative mt-1 flex items-center justify-center">
              {isToday && (
                <motion.span
                  variants={breathRing}
                  animate="animate"
                  className="absolute inset-0 rounded-full"
                  style={{ border: `1px solid ${ink.ember}` }}
                />
              )}
              <span className={`flex items-center justify-center text-[20px] h-9 w-9 rounded-full ${isToday ? 'text-amber-300 font-medium' : 'text-stone-100 font-light'}`}>
                {format(day, 'd')}
              </span>
            </div>
          </div>
        );
      })}

      <div className="relative">
        {HOURS.map(h => (
          <div key={h} className="text-[10px] text-stone-500 text-right pr-2" style={{ height: HOUR_HEIGHT }}>
            <span className="relative -top-1.5">{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="col-span-7 grid relative"
        style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}
      >
        {days.map((day, dayIdx) => {
          const isSat = getDay(day) === 6;
          const isToday = isSameDay(day, now);
          const dayKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay[dayKey] ?? [];
          return (
            <div key={dayKey} className="relative border-l border-stone-800/40">
              {isSat && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: 'linear-gradient(180deg, rgba(233,195,73,0.05) 0%, rgba(233,195,73,0) 100%)' }}
                />
              )}
              {HOURS.map(h => (
                <div
                  key={h}
                  onClick={() => handleSlotClick(day, h)}
                  className="border-b border-stone-800/30 hover:bg-stone-800/20 transition-colors cursor-pointer"
                  style={{ height: HOUR_HEIGHT }}
                />
              ))}
              <AnimatePresence mode="popLayout">
                {dayEvents.map(act => (
                  <CalendarEvent
                    key={act.id}
                    activity={act}
                    variant="week"
                    style={eventStyle(act)}
                    onClick={onEventClick}
                  />
                ))}
              </AnimatePresence>
              {isToday && nowOffsetPx >= 0 && dayIdx === todayIdx && (
                <motion.div
                  layout
                  className="absolute left-0 right-0 pointer-events-none z-20"
                  style={{ top: nowOffsetPx, height: 1, background: ink.ember, opacity: 0.6 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full" style={{ background: ink.ember }} />
                </motion.div>
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/views/WeekView.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add custom WeekView with breathing today ring + now line + Shabbat gradient"
```

---

## Task 7: MonthView

**Files:**
- Create: `frontend/src/calendar/views/MonthView.tsx`

- [ ] **Step 1: Crear `frontend/src/calendar/views/MonthView.tsx`**

```tsx
import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { startOfMonth, startOfWeek, addDays, format, isSameMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Activity } from '../types';
import { ink } from '../tokens';
import { breathRing } from '../motion/breath';
import { staggerContainer } from '../motion/transitions';
import CalendarEvent from '../components/CalendarEvent';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

type Props = {
  date: Date;
  activities: Activity[];
  onDayClick?: (day: Date) => void;
  onEventClick?: (a: Activity) => void;
};

export default function MonthView({ date, activities, onDayClick, onEventClick }: Props) {
  const today = new Date();
  const days = useMemo(() => {
    const monthStart = startOfMonth(date);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [date]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    for (const act of activities) {
      const key = format(new Date(act.inicio), 'yyyy-MM-dd');
      if (!map[key]) map[key] = [];
      map[key].push(act);
    }
    return map;
  }, [activities]);

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-7 mb-2">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-[10px] uppercase tracking-[0.12em] text-stone-400 text-center py-2">{w}</div>
        ))}
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-7 grid-rows-6 gap-px bg-stone-800/30 rounded-xl overflow-hidden"
        style={{ minHeight: 540 }}
      >
        {days.map(day => {
          const inMonth = isSameMonth(day, date);
          const isToday = isSameDay(day, today);
          const dayKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay[dayKey] ?? [];
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visible.length;

          return (
            <div
              key={dayKey}
              onClick={() => onDayClick?.(day)}
              className={`bg-[#15181d] hover:bg-[#1b1f25] cursor-pointer p-1.5 flex flex-col gap-0.5 transition-colors ${inMonth ? '' : 'opacity-40'}`}
            >
              <div className="flex items-center justify-end relative">
                {isToday && (
                  <motion.span
                    variants={breathRing}
                    animate="animate"
                    className="absolute right-0 w-7 h-7 rounded-full"
                    style={{ border: `1px solid ${ink.ember}` }}
                  />
                )}
                <span className={`relative text-[11px] ${isToday ? 'text-amber-300 font-semibold' : 'text-stone-300'} px-1.5`}>
                  {format(day, 'd')}
                </span>
              </div>
              <AnimatePresence mode="popLayout">
                {visible.map(act => (
                  <CalendarEvent key={act.id} activity={act} variant="month" onClick={onEventClick} />
                ))}
              </AnimatePresence>
              {overflow > 0 && (
                <div className="text-[9px] text-stone-400 px-1">+{overflow} más</div>
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/views/MonthView.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add custom MonthView with 7x6 grid and event chips"
```

---

## Task 8: YearView

**Files:**
- Create: `frontend/src/calendar/views/YearView.tsx`

- [ ] **Step 1: Crear `frontend/src/calendar/views/YearView.tsx`**

```tsx
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { startOfMonth, startOfWeek, addDays, format, isSameMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Activity } from '../types';
import { ink } from '../tokens';
import { staggerContainer, fadeUp } from '../motion/transitions';

type Props = {
  date: Date;
  activities: Activity[];
  onMonthClick: (monthDate: Date) => void;
};

type MonthCell = {
  index: number;
  date: Date;
  label: string;
  total: number;
  daysWithActivity: Set<string>;
};

export default function YearView({ date, activities, onMonthClick }: Props) {
  const year = date.getFullYear();
  const today = new Date();

  const months = useMemo<MonthCell[]>(() => {
    const arr: MonthCell[] = [];
    for (let m = 0; m < 12; m++) {
      const monthDate = new Date(year, m, 1);
      const label = format(monthDate, 'MMMM', { locale: es });
      arr.push({ index: m, date: monthDate, label, total: 0, daysWithActivity: new Set() });
    }
    for (const act of activities) {
      const d = new Date(act.inicio);
      if (d.getFullYear() !== year) continue;
      const cell = arr[d.getMonth()];
      if (cell) {
        cell.total += 1;
        cell.daysWithActivity.add(format(d, 'yyyy-MM-dd'));
      }
    }
    return arr;
  }, [activities, year]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="grid grid-cols-2 md:grid-cols-3 gap-3"
    >
      {months.map(cell => (
        <motion.button
          key={cell.index}
          variants={fadeUp}
          whileHover={{ y: -2 }}
          transition={{ duration: 0.25 }}
          type="button"
          onClick={() => onMonthClick(cell.date)}
          className="text-left rounded-2xl border border-stone-700/40 bg-[#15181d] hover:border-amber-300/40 hover:bg-[#1b1f26] p-4 transition-colors"
        >
          <p className="text-stone-200 capitalize text-sm font-serif">{cell.label}</p>
          <MiniMonthGrid date={cell.date} activeDays={cell.daysWithActivity} today={today} />
          <p className="text-[10px] text-stone-400 uppercase tracking-[0.16em] mt-3">{cell.total} actividades</p>
        </motion.button>
      ))}
    </motion.div>
  );
}

function MiniMonthGrid({ date, activeDays, today }: { date: Date; activeDays: Set<string>; today: Date }) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(date);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [date]);

  return (
    <div className="grid grid-cols-7 gap-[2px] mt-3">
      {days.map(d => {
        const inMonth = isSameMonth(d, date);
        const key = format(d, 'yyyy-MM-dd');
        const hasActivity = activeDays.has(key);
        const isToday = isSameDay(d, today);
        return (
          <div
            key={key}
            className="aspect-square rounded-[2px] flex items-center justify-center"
            style={{
              background: hasActivity ? ink.emberSoft : 'rgba(255,255,255,0.02)',
              opacity: inMonth ? 1 : 0.3,
              outline: isToday ? `1px solid ${ink.ember}` : 'none',
            }}
          >
            {hasActivity && <span className="w-1 h-1 rounded-full" style={{ background: ink.ember }} />}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/views/YearView.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add custom YearView with mini month density grids"
```

---

## Task 9: ViewMorph (transición entre vistas)

**Files:**
- Create: `frontend/src/calendar/views/ViewMorph.tsx`

- [ ] **Step 1: Crear `frontend/src/calendar/views/ViewMorph.tsx`**

```tsx
import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import type { CalendarView } from '../types';

const ORDER: Record<CalendarView, number> = { semana: 0, mes: 1, anio: 2 };

type Props = {
  view: CalendarView;
  children: ReactNode;
};

export default function ViewMorph({ view, children }: Props) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {children}
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait" custom={view}>
      <motion.div
        key={view}
        custom={view}
        initial={(currentView: CalendarView) => {
          const dirIn = ORDER[currentView] > ORDER[view] ? -1 : 1;
          return { opacity: 0, scale: dirIn > 0 ? 0.92 : 1.08, y: dirIn > 0 ? 12 : -12 };
        }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={(currentView: CalendarView) => {
          const dirOut = ORDER[currentView] > ORDER[view] ? 1 : -1;
          return { opacity: 0, scale: dirOut > 0 ? 1.08 : 0.92, y: dirOut > 0 ? -12 : 12 };
        }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: 'center center' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/views/ViewMorph.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add ViewMorph with directional zoom transitions + reduced-motion fallback"
```

---

## Task 10: SefirotTree (árbol con respiración)

**Files:**
- Create: `frontend/src/calendar/components/SefirotTree.tsx`

- [ ] **Step 1: Crear `frontend/src/calendar/components/SefirotTree.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { SefiraNode, VolumeItem } from '../types';
import { CONNECTIONS, SEFIRA_COLORS, ink } from '../tokens';
import { breathScale, breathHalo, breathFast, randomBreathDelay } from '../motion/breath';

type Props = {
  sefirot: SefiraNode[];
  volume: VolumeItem[];
  filterId: string | null;
  onFilterToggle: (id: string) => void;
};

type HoverState = { id: string; x: number; y: number } | null;

export default function SefirotTree({ sefirot, volume, filterId, onFilterToggle }: Props) {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<HoverState>(null);

  const volumeMap = useMemo(() => {
    const m: Record<string, VolumeItem> = {};
    for (const v of volume) m[v.sefira_id] = v;
    return m;
  }, [volume]);

  const maxCount = Math.max(1, ...volume.map(v => v.actividades_total));

  const nodeDelays = useMemo(() => {
    const d: Record<string, number> = {};
    for (const s of sefirot) d[s.id] = randomBreathDelay();
    return d;
  }, [sefirot]);

  const hoveredNode = hover ? sefirot.find(s => s.id === hover.id) : null;
  const hoveredVolume = hover ? volumeMap[hover.id] : null;

  return (
    <div className="relative w-full" style={{ aspectRatio: '400 / 800', maxWidth: 360, margin: '0 auto' }}>
      <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full">
        <defs>
          <filter id="sefiraGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="lineShimmer" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"  stopColor={ink.ember} stopOpacity="0" />
            <stop offset="50%" stopColor={ink.ember} stopOpacity="0.6" />
            <stop offset="100%" stopColor={ink.ember} stopOpacity="0" />
          </linearGradient>
        </defs>

        {CONNECTIONS.map((c, idx) => {
          const a = sefirot.find(s => s.id === c.n1);
          const b = sefirot.find(s => s.id === c.n2);
          if (!a || !b) return null;
          const dimmed = filterId !== null && filterId !== c.n1 && filterId !== c.n2;
          return (
            <g key={`${c.n1}-${c.n2}`}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="rgba(253,230,138,0.18)"
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={dimmed ? 0.05 : 1}
                style={{ transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1)' }}
              />
              {!reduced && !dimmed && (
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="url(#lineShimmer)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  style={{
                    strokeDasharray: '40 200',
                    animation: `shimmer-${idx} 6s linear infinite`,
                    animationDelay: `${(idx * 0.4) % 6}s`,
                  }}
                />
              )}
            </g>
          );
        })}

        <style>{`
          ${CONNECTIONS.map((_, idx) => `
            @keyframes shimmer-${idx} {
              0%   { stroke-dashoffset: 240; }
              100% { stroke-dashoffset: 0; }
            }
          `).join('\n')}
        `}</style>

        {sefirot.map(node => {
          const v = volumeMap[node.id];
          const count = v?.actividades_total ?? 0;
          const ratio = Math.sqrt(count / maxCount);
          const r = 24 + ratio * 22;
          const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
          const isActive = filterId === node.id;
          const isOther = filterId !== null && !isActive;

          return (
            <motion.g
              key={node.id}
              onClick={() => onFilterToggle(node.id)}
              onMouseEnter={() => setHover({ id: node.id, x: node.x, y: node.y })}
              onMouseLeave={() => setHover(prev => (prev?.id === node.id ? null : prev))}
              style={{ cursor: 'pointer', transformOrigin: `${node.x}px ${node.y}px` }}
              animate={{ opacity: isOther ? 0.25 : 1, scale: isActive ? 1.12 : 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              {!reduced && (
                <motion.circle
                  cx={node.x} cy={node.y} r={r + 6}
                  fill={color}
                  filter="url(#sefiraGlow)"
                  variants={isActive ? breathFast : breathHalo}
                  animate="animate"
                  style={{ animationDelay: `${nodeDelays[node.id]}s` } as React.CSSProperties}
                />
              )}
              <motion.circle
                cx={node.x} cy={node.y} r={r}
                fill={color}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1}
                variants={reduced ? undefined : breathScale}
                animate={reduced ? undefined : 'animate'}
                style={{ transformOrigin: `${node.x}px ${node.y}px` }}
              />
              <text
                x={node.x} y={node.y - 4}
                textAnchor="middle"
                fill="rgba(255,255,255,0.92)"
                style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', pointerEvents: 'none' }}
              >
                {node.name.toUpperCase()}
              </text>
              <text
                x={node.x} y={node.y + 8}
                textAnchor="middle"
                fill="rgba(255,255,255,0.7)"
                style={{ fontSize: 8, pointerEvents: 'none' }}
              >
                {count}
              </text>
            </motion.g>
          );
        })}
      </svg>

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
              left: `${(hoveredNode.x / 400) * 100}%`,
              top: `${(hoveredNode.y / 800) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 18px))',
              minWidth: 160,
            }}
          >
            <p className="text-[11px] font-semibold text-amber-100 uppercase tracking-wider">{hoveredNode.name}</p>
            {hoveredNode.description && (
              <p className="text-[10px] text-stone-300/80 mt-1 leading-snug">{hoveredNode.description}</p>
            )}
            <p className="text-[10px] text-amber-200/80 mt-1 tabular-nums">
              {hoveredVolume?.actividades_total ?? 0} act. · {hoveredVolume?.horas_total ?? 0} h
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/components/SefirotTree.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add SefirotTree SVG with breath, halos, shimmer connections, and hover tooltip"
```

---

## Task 11: SefirotLegend (lista vertical compacta)

**Files:**
- Create: `frontend/src/calendar/components/SefirotLegend.tsx`

- [ ] **Step 1: Crear `frontend/src/calendar/components/SefirotLegend.tsx`**

```tsx
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { SefiraNode, VolumeItem } from '../types';
import { SEFIRA_COLORS } from '../tokens';
import { breathFast } from '../motion/breath';
import { staggerContainer, fadeUp } from '../motion/transitions';

type Props = {
  sefirot: SefiraNode[];
  volume: VolumeItem[];
  filterId: string | null;
  onFilterToggle: (id: string) => void;
};

export default function SefirotLegend({ sefirot, volume, filterId, onFilterToggle }: Props) {
  const sorted = useMemo(() => {
    return [...volume].sort((a, b) => b.actividades_total - a.actividades_total || b.horas_total - a.horas_total);
  }, [volume]);

  const maxCount = Math.max(1, ...volume.map(v => v.actividades_total));

  if (sorted.length === 0) {
    return (
      <p className="text-xs text-stone-500 italic mt-4 text-center">
        Sin actividades aún en este rango.
      </p>
    );
  }

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-1 mt-4">
      {sorted.map(item => {
        const isActive = filterId === item.sefira_id;
        const color = SEFIRA_COLORS[item.sefira_id] ?? '#a3a3a3';
        const ratio = item.actividades_total / maxCount;
        return (
          <motion.button
            key={item.sefira_id}
            variants={fadeUp}
            type="button"
            onClick={() => onFilterToggle(item.sefira_id)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${isActive ? 'bg-stone-800/60 border-amber-300/30' : 'bg-stone-950/30 border-stone-800/50 hover:bg-stone-900/60'}`}
          >
            <motion.span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: color }}
              variants={isActive ? breathFast : undefined}
              animate={isActive ? 'animate' : undefined}
            />
            <span className="text-xs text-stone-200 font-medium flex-1 text-left truncate">{item.sefira_nombre}</span>
            <div className="flex-1 max-w-[80px] h-1 rounded-full bg-stone-800 overflow-hidden">
              <div className="h-full" style={{ width: `${ratio * 100}%`, background: color, opacity: 0.7 }} />
            </div>
            <span className="text-[10px] text-amber-200/80 tabular-nums shrink-0">
              {item.actividades_total} · {item.horas_total}h
            </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
```

- [ ] **Step 2: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/components/SefirotLegend.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add SefirotLegend vertical list with sync filter and breath dot"
```

---

## Task 12: ActivityForm

**Files:**
- Create: `frontend/src/calendar/components/ActivityForm.tsx`

- [ ] **Step 1: Crear `frontend/src/calendar/components/ActivityForm.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SefiraNode, Activity } from '../types';
import { SEFIRA_COLORS, API_BASE } from '../tokens';

type Props = {
  sefirot: SefiraNode[];
  editing: Activity | null;
  initialDate?: Date;
  initialSlot?: { start: Date; end: Date } | null;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted?: () => void;
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

export default function ActivityForm({ sefirot, editing, initialDate, initialSlot, onSaved, onCancel, onDeleted }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => ymd(initialDate ?? new Date()));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [selected, setSelected] = useState<string[]>([]);
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
    } else if (initialSlot) {
      setDate(ymd(initialSlot.start));
      setStartTime(hm(initialSlot.start));
      setEndTime(hm(initialSlot.end));
      setTitle('');
      setDescription('');
      setSelected([]);
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
      const payload = { titulo: title, descripcion: description, inicio: startIso, fin: endIso, sefirot_ids: selected };
      const url = editing ? `${API_BASE}/actividades/${editing.id}` : `${API_BASE}/actividades`;
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
    const res = await fetch(`${API_BASE}/actividades/${editing.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('No se pudo eliminar');
      return;
    }
    onDeleted?.();
  }

  const inputBase = "w-full bg-transparent border-0 border-b border-stone-700/50 focus:border-b-2 focus:border-amber-300/70 focus:outline-none text-sm text-stone-100 px-0 py-2 transition-colors";

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

      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Descripción</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Intención y foco energético..." className={`${inputBase} min-h-[100px] resize-y border-b-0 border bg-[#1b1f25] rounded-lg px-3 py-2 mt-2`} />
      </div>

      <motion.div animate={shake ? { x: [-3, 3, -2, 2, 0] } : { x: 0 }} transition={{ duration: 0.3 }} key={shake}>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Sefirot</label>
        <div className="mt-3 flex flex-wrap gap-2">
          {sefirot.map(s => {
            const active = selected.includes(s.id);
            const color = SEFIRA_COLORS[s.id] ?? '#a3a3a3';
            return (
              <motion.button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                whileTap={{ scale: 1.08 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider border transition"
                style={{
                  borderColor: active ? color : 'rgba(120,120,120,0.4)',
                  background: active ? `${color}26` : 'rgba(38,42,50,0.8)',
                  color: active ? '#f5f5f5' : '#b7bac1',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {s.name}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.p
            key={error}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-red-400 text-xs"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

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
            {confirmDelete ? 'Click otra vez para confirmar' : 'Borrar actividad'}
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
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-stone-900"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/components/ActivityForm.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add ActivityForm with shake validation, two-step delete, loading dots"
```

---

## Task 13: ActivityPanel

**Files:**
- Create: `frontend/src/calendar/components/ActivityPanel.tsx`

- [ ] **Step 1: Crear `frontend/src/calendar/components/ActivityPanel.tsx`**

```tsx
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { SefiraNode, Activity } from '../types';
import { panelSpring, panelExit } from '../motion/transitions';
import ActivityForm from './ActivityForm';

type Props = {
  open: boolean;
  sefirot: SefiraNode[];
  editing: Activity | null;
  initialSlot: { start: Date; end: Date } | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
};

export default function ActivityPanel({ open, sefirot, editing, initialSlot, onClose, onSaved, onDeleted }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={panelExit}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-[#0a0a0c]/85"
          />
          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%', transition: panelExit }}
            transition={panelSpring}
            className="fixed right-0 top-0 z-[70] h-full w-full max-w-[460px] bg-[#15181d] border-l border-stone-700/45 shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col"
          >
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(233,195,73,0.15)' }}>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400">Gestor de actividad</p>
                <h4 className="font-serif text-2xl mt-1 text-amber-100/90">{editing ? 'Editar actividad' : 'Crear actividad'}</h4>
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

            <ActivityForm
              sefirot={sefirot}
              editing={editing}
              initialSlot={initialSlot}
              onSaved={onSaved}
              onCancel={onClose}
              onDeleted={onDeleted}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/components/ActivityPanel.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add ActivityPanel with spring entry and rotating close button"
```

---

## Task 14: CalendarModule (orquestador) + barrel

**Files:**
- Create: `frontend/src/calendar/CalendarModule.tsx`
- Create: `frontend/src/calendar/index.ts`

- [ ] **Step 1: Crear `frontend/src/calendar/CalendarModule.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { startOfMonth } from 'date-fns';
import type { SefiraNode, Activity } from './types';
import { useCalendarRange } from './hooks/useCalendarRange';
import { useActivities } from './hooks/useActivities';
import CalendarToolbar from './components/CalendarToolbar';
import WeekView from './views/WeekView';
import MonthView from './views/MonthView';
import YearView from './views/YearView';
import ViewMorph from './views/ViewMorph';
import SefirotTree from './components/SefirotTree';
import SefirotLegend from './components/SefirotLegend';
import ActivityPanel from './components/ActivityPanel';

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

  const filteredActivities = useMemo(() => {
    if (!filterId) return activities;
    return activities.filter(a => a.sefirot.some(s => s.id === filterId));
  }, [activities, filterId]);

  function openCreate() {
    setEditing(null);
    setPendingSlot(null);
    setPanelOpen(true);
  }

  function openSlot(start: Date, end: Date) {
    const overlap = activities.find(a => new Date(a.inicio) < end && new Date(a.fin) > start);
    if (overlap) {
      setEditing(overlap);
      setPendingSlot(null);
    } else {
      setEditing(null);
      setPendingSlot({ start, end });
    }
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
    setEditing(a);
    setPendingSlot(null);
    setPanelOpen(true);
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
              <WeekView
                date={anchor}
                activities={filteredActivities}
                onSlotClick={openSlot}
                onEventClick={openEvent}
              />
            )}
            {view === 'mes' && (
              <MonthView
                date={anchor}
                activities={filteredActivities}
                onDayClick={openDay}
                onEventClick={openEvent}
              />
            )}
            {view === 'anio' && (
              <YearView
                date={anchor}
                activities={activities}
                onMonthClick={openMonth}
              />
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

        <SefirotTree
          sefirot={sefirot}
          volume={volume}
          filterId={filterId}
          onFilterToggle={toggleFilter}
        />

        <SefirotLegend
          sefirot={sefirot}
          volume={volume}
          filterId={filterId}
          onFilterToggle={toggleFilter}
        />
      </div>

      <ActivityPanel
        open={panelOpen}
        sefirot={sefirot}
        editing={editing}
        initialSlot={pendingSlot}
        onClose={() => setPanelOpen(false)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
```

- [ ] **Step 2: Crear `frontend/src/calendar/index.ts`**

```ts
export { default } from './CalendarModule';
```

- [ ] **Step 3: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/calendar/CalendarModule.tsx frontend/src/calendar/index.ts
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): add CalendarModule orchestrator + barrel"
```

---

## Task 15: Switch del import en App.tsx + verificación visual

**Files:**
- Modify: `frontend/src/App.tsx:3`

- [ ] **Step 1: Cambiar import en `frontend/src/App.tsx`**

Línea 3: `import CalendarModule from "./CalendarModule";`
Reemplazar por: `import CalendarModule from "./calendar";`

- [ ] **Step 2: Verificar TS compila**

Run: `cd "c:/Users/123/Desktop/Kabbalah Space/frontend" && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Iniciar backend en una terminal**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/backend"
source venv/Scripts/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Expected: `Uvicorn running on http://127.0.0.1:8000`

- [ ] **Step 4: Iniciar frontend en otra terminal**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npm run dev
```

Expected: `Local: http://localhost:5173/`

- [ ] **Step 5: Verificación visual manual en navegador**

Abrir `http://localhost:5173`, navegar a "Calendario Cabalístico" y verificar:

1. **Toolbar**: título serif grande, selector Semana/Mes/Año con la pastilla dorada que se desliza al cambiar (no salta).
2. **Vista Semana** (default): grilla 7 columnas + columna horaria. Día actual con anillo dorado respirante (8s ciclo). Columna del sábado con leve gradiente ámbar. Línea del "ahora" dorada cruzando el día actual.
3. **Click en slot vacío**: abre panel lateral con spring (no slide rígido). Backdrop se difumina progresivamente.
4. **Crear actividad** (con ≥1 sefirá): cierra panel, aparece el chip animado en la grilla. Botón "Guardar" muestra puntitos pulsantes durante el save.
5. **Sin sefirot al guardar**: el bloque de chips de sefirot hace shake horizontal.
6. **Click en evento existente**: abre panel en modo edición.
7. **Borrar**: primer click cambia botón a rojo "Click otra vez para confirmar"; tras 3s sin acción vuelve atrás. Segundo click ejecuta y cierra.
8. **Cambiar a Mes**: animación de zoom-out, los eventos vuelan a sus celdas con `layoutId`.
9. **Cambiar a Año**: zoom-out aún más; mini-grids con puntos dorados donde hay actividades.
10. **Click en mes**: zoom-in directo a ese mes en vista Mes.
11. **Árbol Sefirótico**: nodos con respiración (escala 1↔1.025) desfasada entre nodos. Líneas con shimmer dorado recorriéndolas.
12. **Click en sefirá**: nodo activo crece, otros se atenúan, líneas no relacionadas se atenúan. Eventos del calendario filtrados; chips no relacionados desaparecen con animación.
13. **Leyenda inferior**: lista vertical (no horizontal scroll), ordenada por actividad descendente, con barras de progreso. Click sincronizado con árbol.
14. **DevTools → Throttling → reduced-motion ON**: todas las respiraciones se detienen, transiciones se reducen a 150ms.

Si algo falla visualmente: anotar el ítem fallado y arreglar antes de continuar.

- [ ] **Step 6: Commit del switch**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add frontend/src/App.tsx
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "feat(calendar): switch App import to new modular calendar"
```

---

## Task 16: Cleanup (eliminar código viejo)

**Files:**
- Delete: `frontend/src/CalendarModule.tsx`
- Modify: `frontend/src/index.css:110-211` (remover reglas `.rbc-theme`)
- Modify: `frontend/package.json` (remover `react-big-calendar` y `@types/react-big-calendar`)

- [ ] **Step 1: Borrar el `CalendarModule.tsx` viejo**

```bash
rm "c:/Users/123/Desktop/Kabbalah Space/frontend/src/CalendarModule.tsx"
```

- [ ] **Step 2: Remover reglas `.rbc-theme` de `frontend/src/index.css`**

Borrar las líneas 110-211 (todas las reglas `.rbc-theme .rbc-*`). El archivo debe terminar después de la regla `* { scrollbar-width: thin; ... }` (línea 108).

Verificación: `grep -n "rbc" "c:/Users/123/Desktop/Kabbalah Space/frontend/src/index.css"` debe devolver vacío.

- [ ] **Step 3: Desinstalar `react-big-calendar`**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npm uninstall react-big-calendar @types/react-big-calendar
```

Expected: paquetes removidos de `package.json` y `node_modules/`.

- [ ] **Step 4: Verificar TS compila y dev build pasa**

Run:
```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npx tsc -b --noEmit
```
Expected: PASS.

Si algún archivo todavía importa de `react-big-calendar` o referencia el viejo `CalendarModule.tsx`, los errores aparecerán. Resolver antes de continuar.

- [ ] **Step 5: Verificación visual rápida**

Refrescar `http://localhost:5173` (con dev server corriendo). El módulo debe seguir renderizando exactamente igual que tras Task 15 — la única diferencia es que ya no hay archivos muertos.

- [ ] **Step 6: Commit cleanup**

```bash
git -C "c:/Users/123/Desktop/Kabbalah Space" add -A frontend/src/CalendarModule.tsx frontend/src/index.css frontend/package.json frontend/package-lock.json
git -C "c:/Users/123/Desktop/Kabbalah Space" commit -m "chore(calendar): remove legacy CalendarModule and react-big-calendar dependency"
```

---

## Notas finales

- **App_old.tsx** (`frontend/src/App_old.tsx`) no se toca en este plan — está fuera del alcance del módulo de calendario y removerlo es una decisión separada.
- Los **scripts python `fix*.py`/`replace*.py`** sueltos en `frontend/` también quedan como están — no son parte del módulo.
- Si durante la verificación visual aparecen problemas con el aspecto del SVG en distintas resoluciones, revisar `viewBox="0 0 400 800"` en `SefirotTree.tsx` — los `x/y` de cada nodo en `App.tsx` se basan en ese sistema de coordenadas.
- El backend no requiere ningún cambio. Endpoints ya existen y se consumen idénticos a la versión vieja.
