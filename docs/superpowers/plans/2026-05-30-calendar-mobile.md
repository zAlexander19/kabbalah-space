# Calendar Mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar UI mobile-first del módulo Calendar — 3 vistas separadas (WeekViewMobile con swipe entre días, MonthViewMobile con grid compacto + lista del día, YearViewMobile con heatmap por sefirá), toolbar adaptado, bottom-sheet para el form, FAB flotante, y long-press para mover actividades con el dedo.

**Architecture:** Componentes separados por viewport (no Tailwind responsive). `CalendarModule.tsx` usa un hook `useMediaQuery` para decidir entre componentes desktop existentes y los nuevos `*Mobile.tsx`. Hooks foundational primero (`useMediaQuery`, `useLongPress`, extensión de `useCalendarRange`), después las 3 vistas + auxiliares, después integración final en `CalendarModule.tsx`, después QA manual con checklist de 22 puntos.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind 4 + Framer Motion + date-fns. Sin tests automatizados (no hay framework configurado en el frontend) — verificación por **TypeScript compile** (`tsc -b`), **build OK** (`npm run build`), y **smoke test manual** con devtools mobile emulation + idealmente un dispositivo físico.

**Spec de referencia:** [docs/superpowers/specs/2026-05-30-calendar-mobile-design.md](../specs/2026-05-30-calendar-mobile-design.md)

---

## File Structure

### Archivos nuevos
- `frontend/src/shared/hooks/useMediaQuery.ts` — hook reusable que escucha `window.matchMedia`
- `frontend/src/calendar/hooks/useLongPress.ts` — hook que detecta long-press (500ms) con cancelación por movimiento + haptic
- `frontend/src/calendar/views/WeekViewMobile.tsx` — día único con swipe horizontal entre días
- `frontend/src/calendar/views/MonthViewMobile.tsx` — grid 7×6 con marcas + lista de eventos del día seleccionado
- `frontend/src/calendar/views/YearViewMobile.tsx` — lista vertical de meses con heatmap horizontal
- `frontend/src/calendar/components/CalendarToolbarMobile.tsx` — toolbar de 2 filas (nav + view selector)
- `frontend/src/calendar/components/ActivityPanelMobile.tsx` — bottom sheet con drag-to-close envolviendo `ActivityForm`
- `frontend/src/calendar/components/ActivityFab.tsx` — FAB flotante con ícono "+"

### Archivos modificados
- `frontend/src/calendar/CalendarModule.tsx` — switch desktop/mobile via `useMediaQuery`
- `frontend/src/calendar/hooks/useCalendarRange.ts` — agregar `goPrevDay()` / `goNextDay()`
- `frontend/src/calendar/components/CalendarEvent.tsx` — prop `enableLongPressDrag` y lógica de drag mobile
- `frontend/src/calendar/components/ActivityForm.tsx` — verificar inputs full-width (si faltan, agregar)

### NOT en este plan
- Otros módulos mobile (Espejo, Evolución, Inicio, Cuenta, Premium)
- Tablet UI dedicada (≥768px)
- Edición de recurrencias mejorada en mobile
- Drag entre vistas
- Vitest + React Testing Library

---

## Task 1: useMediaQuery — hook reusable

**Files:**
- Create: `frontend/src/shared/hooks/useMediaQuery.ts`

- [ ] **Step 1: Crear el archivo del hook**

```typescript
// frontend/src/shared/hooks/useMediaQuery.ts
import { useEffect, useState } from 'react';

/**
 * Returns whether the given media query currently matches.
 *
 * SSR-safe: returns `false` when `window` is undefined.
 * Listens for changes and cleans up on unmount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
```

- [ ] **Step 2: Verificar tsc**

Run: `cd frontend && npx tsc -b`
Expected: PASS (sin output).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/hooks/useMediaQuery.ts
git commit -m "feat(shared): useMediaQuery hook reusable + SSR-safe"
```

---

## Task 2: useLongPress — hook con cancelación por movimiento + haptic

**Files:**
- Create: `frontend/src/calendar/hooks/useLongPress.ts`

- [ ] **Step 1: Crear el archivo del hook**

```typescript
// frontend/src/calendar/hooks/useLongPress.ts
import { useCallback, useRef } from 'react';

interface LongPressOptions {
  /** Cuántos ms hay que mantener apretado antes de disparar onLongPress. Default 500ms. */
  delay?: number;
  /** Si true, mover el dedo más de `moveThreshold` antes de los `delay` ms cancela el long-press. Default true. */
  cancelOnMove?: boolean;
  /** Distancia en px antes de cancelar (si cancelOnMove=true). Default 10. */
  moveThreshold?: number;
}

interface LongPressHandlers<T extends HTMLElement> {
  onPointerDown: (e: React.PointerEvent<T>) => void;
  onPointerUp: (e: React.PointerEvent<T>) => void;
  onPointerLeave: (e: React.PointerEvent<T>) => void;
  onPointerMove: (e: React.PointerEvent<T>) => void;
  onPointerCancel: (e: React.PointerEvent<T>) => void;
}

/**
 * Long-press hook que cancela si el dedo se mueve antes del delay.
 * Dispara haptic feedback (40ms vibration) al activar, si el browser lo soporta.
 *
 * Uso:
 *   const handlers = useLongPress(() => console.log('held!'));
 *   return <div {...handlers}>Hold me</div>;
 */
export function useLongPress<T extends HTMLElement>(
  onLongPress: (e: React.PointerEvent<T>) => void,
  options: LongPressOptions = {},
): LongPressHandlers<T> {
  const { delay = 500, cancelOnMove = true, moveThreshold = 10 } = options;
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
    triggeredRef.current = false;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<T>) => {
      startRef.current = { x: e.clientX, y: e.clientY };
      triggeredRef.current = false;
      timerRef.current = window.setTimeout(() => {
        triggeredRef.current = true;
        if (typeof navigator.vibrate === 'function') {
          navigator.vibrate(40);
        }
        onLongPress(e);
      }, delay);
    },
    [delay, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      if (!cancelOnMove || !startRef.current || triggeredRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) > moveThreshold) clear();
    },
    [cancelOnMove, moveThreshold, clear],
  );

  return {
    onPointerDown,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerMove,
    onPointerCancel: clear,
  };
}
```

- [ ] **Step 2: Verificar tsc**

Run: `cd frontend && npx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/calendar/hooks/useLongPress.ts
git commit -m "feat(calendar): useLongPress hook con cancelación por movimiento + haptic"
```

---

## Task 3: useCalendarRange — agregar goPrevDay / goNextDay

**Files:**
- Modify: `frontend/src/calendar/hooks/useCalendarRange.ts`

- [ ] **Step 1: Leer el archivo actual**

```bash
cat "c:/Users/123/Desktop/Kabbalah Space/frontend/src/calendar/hooks/useCalendarRange.ts"
```

Identificar dónde se retornan los métodos (probablemente al final con `return { anchor, setAnchor, view, setView, range, goPrev, goNext, goToday }`).

- [ ] **Step 2: Agregar goPrevDay y goNextDay**

Buscar el bloque de funciones `goPrev` y `goNext` y agregar JUSTO ANTES del `return` del hook:

```typescript
  const goPrevDay = useCallback(() => {
    setAnchor((prev) => addDays(prev, -1));
  }, []);

  const goNextDay = useCallback(() => {
    setAnchor((prev) => addDays(prev, 1));
  }, []);
```

Asegurar que `addDays` esté importado de `date-fns` (probablemente ya lo está; verificar la línea de import al principio del archivo).

Agregar al `return` del hook estos 2 métodos. Si el return es desestructurado:

```typescript
  return { anchor, setAnchor, view, setView, range, goPrev, goNext, goPrevDay, goNextDay, goToday };
```

(Adaptar al orden actual sin alterar las propiedades existentes.)

- [ ] **Step 3: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS sin errores. `WeekView` desktop seguirá funcionando porque no usa los métodos nuevos.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/calendar/hooks/useCalendarRange.ts
git commit -m "feat(calendar): useCalendarRange agrega goPrevDay/goNextDay para WeekViewMobile"
```

---

## Task 4: CalendarEvent — soporte de long-press drag

**Files:**
- Modify: `frontend/src/calendar/components/CalendarEvent.tsx`

- [ ] **Step 1: Leer el archivo actual**

```bash
head -80 "c:/Users/123/Desktop/Kabbalah Space/frontend/src/calendar/components/CalendarEvent.tsx"
```

Identificar:
- La prop type (`Props`) y dónde está el `<motion.div>` raíz del componente
- Si ya recibe `onClick` (probablemente sí — el chip es tappable)

- [ ] **Step 2: Agregar prop opcional + integrar useLongPress**

En el `Props` type, agregar:

```typescript
type Props = {
  // ... props existentes
  /** Cuando true, mantener apretado 500ms activa modo drag. Solo para vistas mobile. */
  enableLongPressDrag?: boolean;
  /** Callback al soltar el drag sobre una nueva fecha/hora. Solo aplica cuando enableLongPressDrag=true. */
  onMove?: (id: string, newStart: Date, newEnd: Date) => void;
};
```

En los imports del archivo:
```tsx
import { useLongPress } from '../hooks/useLongPress';
import { useState } from 'react';
```

(`useState` puede ya estar importado — no duplicar.)

Dentro del componente, antes del `return`:

```tsx
const [dragging, setDragging] = useState(false);

const longPressHandlers = useLongPress<HTMLDivElement>(
  () => {
    if (enableLongPressDrag) setDragging(true);
  },
  { delay: 500, cancelOnMove: true, moveThreshold: 10 },
);
```

En el `<motion.div>` raíz del chip, agregar los handlers (sin pisar los existentes — si ya hay `onPointerDown`, encadenar):

```tsx
<motion.div
  // ...props existentes
  {...(enableLongPressDrag ? longPressHandlers : {})}
  className={`...existing classes... ${dragging ? 'ring-2 ring-amber-300/60 scale-105 z-50 shadow-[0_8px_24px_rgba(233,195,73,0.4)]' : ''}`}
  style={{
    ...existingStyle,
    touchAction: dragging ? 'none' : undefined,
  }}
>
```

(Si el componente tiene `style` prop dinámico, fusionar con `touchAction`. Si no, agregar el inline style.)

- [ ] **Step 3: Implementar el drag de Framer Motion cuando dragging=true**

Reemplazar el `<motion.div>` raíz por una versión condicional que cuando `dragging=true` se vuelve draggable y al `onDragEnd` calcula el slot/celda destino:

```tsx
const handleDragEnd = (e: PointerEvent | MouseEvent | TouchEvent) => {
  setDragging(false);
  if (!onMove) return;
  // Obtener el punto donde se soltó (cliente coords).
  const clientX = 'clientX' in e ? e.clientX : (e as TouchEvent).changedTouches[0]?.clientX ?? 0;
  const clientY = 'clientY' in e ? e.clientY : (e as TouchEvent).changedTouches[0]?.clientY ?? 0;
  const els = document.elementsFromPoint(clientX, clientY);
  // Buscar el primer elemento con data-slot (formato: "YYYY-MM-DD|HH")
  const slot = els.find((el) => el instanceof HTMLElement && el.dataset.slot);
  if (!(slot instanceof HTMLElement) || !slot.dataset.slot) return;
  const [dayStr, hourStr] = slot.dataset.slot.split('|');
  const [y, m, d] = dayStr.split('-').map(Number);
  const hour = Number(hourStr);
  const newStart = new Date(y, m - 1, d, hour, 0, 0, 0);
  const durationMs = new Date(activity.fin).getTime() - new Date(activity.inicio).getTime();
  const newEnd = new Date(newStart.getTime() + durationMs);
  onMove(activity.id, newStart, newEnd);
};
```

Y el `<motion.div>`:

```tsx
<motion.div
  drag={dragging}
  dragMomentum={false}
  onDragEnd={handleDragEnd}
  whileDrag={{ scale: 1.08, zIndex: 100 }}
  {...(enableLongPressDrag ? longPressHandlers : {})}
  // ... rest of existing props
>
  {/* ... existing content ... */}
</motion.div>
```

Nota: cuando `drag={false}`, el `<motion.div>` se comporta normal. Cuando `dragging=true`, se vuelve draggable y al soltar dispara `onDragEnd`.

- [ ] **Step 4: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/calendar/components/CalendarEvent.tsx
git commit -m "feat(calendar): CalendarEvent acepta enableLongPressDrag + onMove para uso mobile"
```

---

## Task 5: WeekViewMobile — día único + swipe

**Files:**
- Create: `frontend/src/calendar/views/WeekViewMobile.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
// frontend/src/calendar/views/WeekViewMobile.tsx
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Activity } from '../types';
import { ink } from '../../shared/tokens';
import CalendarEvent from '../components/CalendarEvent';

const HOUR_HEIGHT = 56;
const HOUR_START = 6;
const HOUR_END = 23;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const SWIPE_THRESHOLD = 50;

type Props = {
  date: Date;
  activities: Activity[];
  onPrevDay: () => void;
  onNextDay: () => void;
  onSlotClick?: (start: Date, end: Date) => void;
  onEventClick?: (a: Activity) => void;
  onEventEdit?: (a: Activity) => void;
  onEventDelete?: (a: Activity) => void;
  onEventMove?: (id: string, newStart: Date, newEnd: Date) => void;
  gcalEnabled?: boolean;
};

export default function WeekViewMobile({
  date,
  activities,
  onPrevDay,
  onNextDay,
  onSlotClick,
  onEventClick,
  onEventEdit,
  onEventDelete,
  onEventMove,
  gcalEnabled = false,
}: Props) {
  const reduced = useReducedMotion();
  const dayKey = format(date, 'yyyy-MM-dd');

  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const dayEvents = useMemo(() => {
    return activities.filter((act) => format(new Date(act.inicio), 'yyyy-MM-dd') === dayKey);
  }, [activities, dayKey]);

  const isToday = isSameDay(date, now);
  const nowOffsetPx = isToday
    ? (now.getHours() - HOUR_START) * HOUR_HEIGHT + (now.getMinutes() / 60) * HOUR_HEIGHT
    : -1;

  function handleSlotClick(hour: number) {
    const start = new Date(date);
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
    return { position: 'absolute', top, height: heightHrs * HOUR_HEIGHT - 4, left: 4, right: 4 };
  }

  function handleDragEnd(_: unknown, info: { offset: { x: number } }) {
    if (info.offset.x < -SWIPE_THRESHOLD) onNextDay();
    else if (info.offset.x > SWIPE_THRESHOLD) onPrevDay();
  }

  const dayLabel = format(date, "EEEE d 'de' MMMM yyyy", { locale: es });

  return (
    <div className="w-full" style={{ overscrollBehavior: 'contain' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800/60">
        <button
          type="button"
          onClick={onPrevDay}
          aria-label="Día anterior"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-sm text-amber-100/90 font-medium capitalize">{dayLabel}</h2>
        <button
          type="button"
          onClick={onNextDay}
          aria-label="Día siguiente"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Swipeable day content */}
      <motion.div
        key={dayKey}
        drag={reduced ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.18 }}
        className="touch-pan-y"
      >
        <div className="grid relative" style={{ gridTemplateColumns: '60px 1fr' }}>
          {/* Hour column */}
          <div className="relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="text-[10px] text-stone-500 text-right pr-2"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="relative -top-1.5">{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {/* Day column */}
          <div className="relative border-l border-stone-800/40">
            {HOURS.map((h) => (
              <div
                key={h}
                data-slot={`${dayKey}|${h}`}
                onClick={() => handleSlotClick(h)}
                className="border-b border-stone-800/30 hover:bg-stone-800/20 transition-colors cursor-pointer"
                style={{ height: HOUR_HEIGHT }}
              />
            ))}
            {/* Now indicator */}
            {nowOffsetPx >= 0 && (
              <div
                className="absolute left-0 right-0 h-px bg-amber-300/80"
                style={{ top: nowOffsetPx }}
              >
                <div
                  className="absolute -left-1 -top-1 w-2 h-2 rounded-full"
                  style={{ background: ink.ember }}
                />
              </div>
            )}
            {/* Events */}
            {dayEvents.map((act) => (
              <CalendarEvent
                key={act.id}
                activity={act}
                variant="week"
                style={eventStyle(act)}
                onClick={onEventClick}
                onEdit={onEventEdit ?? onEventClick}
                onDelete={onEventDelete}
                gcalEnabled={gcalEnabled}
                enableLongPressDrag={true}
                onMove={onEventMove}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS. Si falla por algún import (ej. `ink`, `Activity`), inspeccionar las rutas y corregir.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/calendar/views/WeekViewMobile.tsx
git commit -m "feat(calendar): WeekViewMobile con swipe entre días + long-press drag"
```

---

## Task 6: MonthViewMobile — grid compacto + lista del día

**Files:**
- Create: `frontend/src/calendar/views/MonthViewMobile.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
// frontend/src/calendar/views/MonthViewMobile.tsx
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameDay,
  isSameMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Activity } from '../types';

type Props = {
  date: Date;
  activities: Activity[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onEventClick?: (a: Activity) => void;
  onEventMove?: (id: string, newStart: Date, newEnd: Date) => void;
};

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function MonthViewMobile({
  date,
  activities,
  onPrevMonth,
  onNextMonth,
  onEventClick,
  onEventMove,
}: Props) {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState<Date>(date);

  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = useMemo(() => {
    const out: Date[] = [];
    let cur = gridStart;
    while (cur <= gridEnd) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }, [gridStart, gridEnd]);

  // Group activities by day for fast count.
  const countsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const act of activities) {
      const key = format(new Date(act.inicio), 'yyyy-MM-dd');
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [activities]);

  const selectedKey = format(selectedDay, 'yyyy-MM-dd');
  const selectedEvents = useMemo(
    () => activities.filter((a) => format(new Date(a.inicio), 'yyyy-MM-dd') === selectedKey),
    [activities, selectedKey],
  );

  const monthLabel = format(date, "MMMM yyyy", { locale: es });

  function handleDragEnd(act: Activity, _e: unknown, info: { offset: { x: number; y: number } }, sourceEl: HTMLElement) {
    // Compute drop element from sourceEl bounding rect + offset
    const rect = sourceEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 + info.offset.x;
    const cy = rect.top + rect.height / 2 + info.offset.y;
    const els = document.elementsFromPoint(cx, cy);
    const dayEl = els.find((el) => el instanceof HTMLElement && el.dataset.day);
    if (!(dayEl instanceof HTMLElement) || !dayEl.dataset.day || !onEventMove) return;
    const [y, m, d] = dayEl.dataset.day.split('-').map(Number);
    const startD = new Date(act.inicio);
    const endD = new Date(act.fin);
    const newStart = new Date(y, m - 1, d, startD.getHours(), startD.getMinutes(), 0, 0);
    const durationMs = endD.getTime() - startD.getTime();
    const newEnd = new Date(newStart.getTime() + durationMs);
    onEventMove(act.id, newStart, newEnd);
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800/60">
        <button
          type="button"
          onClick={onPrevMonth}
          aria-label="Mes anterior"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-sm text-amber-100/90 font-medium capitalize">{monthLabel}</h2>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="Mes siguiente"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 px-2 py-2">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] text-stone-500 uppercase tracking-[0.12em]">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1 px-2 pb-3">
        {days.map((day) => {
          const dayKey = format(day, 'yyyy-MM-dd');
          const count = countsByDay[dayKey] ?? 0;
          const inMonth = isSameMonth(day, date);
          const isSelected = isSameDay(day, selectedDay);
          const isCurrent = isSameDay(day, today);
          return (
            <button
              key={dayKey}
              type="button"
              data-day={dayKey}
              onClick={() => setSelectedDay(day)}
              className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                isSelected ? 'ring-2 ring-amber-300/70' : ''
              } ${inMonth ? 'text-stone-100' : 'text-stone-600'} ${
                isCurrent ? 'font-bold text-amber-300' : ''
              } hover:bg-stone-800/40`}
            >
              <span>{format(day, 'd')}</span>
              {count > 0 && count <= 3 && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-amber-300" />
              )}
              {count > 3 && (
                <span className="absolute bottom-0.5 text-[9px] text-amber-300/80">+{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day events */}
      <div className="px-4 py-3 border-t border-stone-800/60">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400 mb-3">
          Eventos del {format(selectedDay, "d 'de' MMMM", { locale: es })}
        </p>
        {selectedEvents.length === 0 ? (
          <p className="text-stone-500 italic text-sm">Nada agendado para este día.</p>
        ) : (
          <ul className="space-y-2">
            {selectedEvents.map((act) => {
              const hora = format(new Date(act.inicio), 'HH:mm');
              const sefiraNames = act.sefirot.map((s) => s.nombre).join(', ');
              const ChipMotion = motion.button;
              return (
                <ChipMotion
                  key={act.id}
                  type="button"
                  onClick={() => onEventClick?.(act)}
                  drag={!!onEventMove}
                  dragMomentum={false}
                  onDragEnd={(e, info) => {
                    const el = (e.target as HTMLElement) ?? null;
                    if (el) handleDragEnd(act, e, info, el);
                  }}
                  whileDrag={{ scale: 1.05, zIndex: 50 }}
                  className="w-full text-left rounded-lg border border-stone-800/60 bg-stone-900/40 hover:bg-stone-900/60 px-3 py-2 flex flex-col"
                >
                  <span className="text-stone-100 text-sm">
                    <span className="text-amber-200/80 tabular-nums">{hora}</span> · {act.titulo}
                  </span>
                  {sefiraNames && (
                    <span className="text-[11px] text-stone-400">{sefiraNames}</span>
                  )}
                </ChipMotion>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/calendar/views/MonthViewMobile.tsx
git commit -m "feat(calendar): MonthViewMobile con grid compacto + lista de eventos del día seleccionado"
```

---

## Task 7: YearViewMobile — lista de meses con heatmap por sefirá

**Files:**
- Create: `frontend/src/calendar/views/YearViewMobile.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
// frontend/src/calendar/views/YearViewMobile.tsx
import { useMemo } from 'react';
import { addMonths, startOfMonth, endOfMonth, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Activity, SefiraNode } from '../types';
import { SEFIRA_COLORS } from '../../shared/tokens';

type Props = {
  date: Date;
  activities: Activity[];
  sefirot: SefiraNode[];
  onPrevYear: () => void;
  onNextYear: () => void;
  onSelectMonth: (monthDate: Date) => void;
};

export default function YearViewMobile({
  date,
  activities,
  sefirot,
  onPrevYear,
  onNextYear,
  onSelectMonth,
}: Props) {
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => startOfMonth(addMonths(yearStart, i)));
  }, [yearStart]);

  // Counts per (month index, sefira id).
  const heatmap = useMemo(() => {
    const m: Record<number, Record<string, number>> = {};
    for (let i = 0; i < 12; i++) m[i] = {};
    for (const act of activities) {
      const monthIdx = new Date(act.inicio).getMonth();
      for (const s of act.sefirot) {
        m[monthIdx][s.id] = (m[monthIdx][s.id] ?? 0) + 1;
      }
    }
    return m;
  }, [activities]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800/60">
        <button
          type="button"
          onClick={onPrevYear}
          aria-label="Año anterior"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-base text-amber-100/90 font-medium tabular-nums">
          {date.getFullYear()}
        </h2>
        <button
          type="button"
          onClick={onNextYear}
          aria-label="Año siguiente"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Months list */}
      <div className="px-4 py-3 space-y-2">
        {months.map((monthDate, i) => {
          const monthLabel = format(monthDate, 'MMMM', { locale: es });
          const monthEnd = endOfMonth(monthDate);
          const totalActsThisMonth = activities.filter((a) => {
            const t = new Date(a.inicio).getTime();
            return t >= monthDate.getTime() && t <= monthEnd.getTime();
          }).length;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectMonth(monthDate)}
              className="w-full rounded-xl border border-stone-800/60 bg-stone-900/30 hover:bg-stone-900/60 px-4 py-3 flex flex-col gap-2 text-left transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-stone-100 capitalize text-sm font-medium">{monthLabel}</span>
                <span className="text-[10px] text-stone-500 uppercase tracking-[0.12em]">
                  {totalActsThisMonth} {totalActsThisMonth === 1 ? 'actividad' : 'actividades'}
                </span>
              </div>
              <div className="flex gap-1">
                {sefirot.map((s) => {
                  const count = heatmap[i][s.id] ?? 0;
                  const opacity = count === 0 ? 0.15 : Math.min(1, 0.3 + count / 10);
                  const color = SEFIRA_COLORS[s.id] ?? '#a3a3a3';
                  return (
                    <div
                      key={s.id}
                      className="rounded-sm w-5 h-5"
                      style={{ background: color, opacity }}
                      title={`${s.name}: ${count}`}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS. Si `SEFIRA_COLORS` no existe en `shared/tokens.ts` con esa forma, ajustar el import (el spec menciona que existe — verificar antes de cambiar).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/calendar/views/YearViewMobile.tsx
git commit -m "feat(calendar): YearViewMobile con lista de meses + heatmap por sefirá"
```

---

## Task 8: CalendarToolbarMobile + ActivityFab

**Files:**
- Create: `frontend/src/calendar/components/CalendarToolbarMobile.tsx`
- Create: `frontend/src/calendar/components/ActivityFab.tsx`

- [ ] **Step 1: Crear ActivityFab.tsx**

```tsx
// frontend/src/calendar/components/ActivityFab.tsx
import { Plus } from 'lucide-react';

type Props = {
  onClick: () => void;
};

export default function ActivityFab({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Crear actividad"
      className="fixed bottom-6 right-4 z-30 w-14 h-14 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 text-stone-900 shadow-[0_8px_24px_rgba(233,195,73,0.45)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
    >
      <Plus size={28} />
    </button>
  );
}
```

- [ ] **Step 2: Crear CalendarToolbarMobile.tsx**

```tsx
// frontend/src/calendar/components/CalendarToolbarMobile.tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { CalendarView } from '../types';

type Props = {
  date: Date;
  view: CalendarView;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (v: CalendarView) => void;
};

const VIEW_OPTIONS: { key: CalendarView; label: string }[] = [
  { key: 'semana', label: 'Semana' },
  { key: 'mes',    label: 'Mes' },
  { key: 'anio',   label: 'Año' },
];

export default function CalendarToolbarMobile({
  date,
  view,
  onPrev,
  onNext,
  onToday,
  onViewChange,
}: Props) {
  // Label dinámico según view
  let label: string;
  if (view === 'semana') {
    label = format(date, "EEEE d 'de' MMM", { locale: es });
  } else if (view === 'mes') {
    label = format(date, "MMMM yyyy", { locale: es });
  } else {
    label = String(date.getFullYear());
  }

  return (
    <div className="w-full bg-[#15181d] border border-stone-700/40 rounded-2xl overflow-hidden">
      {/* Fila 1: prev / label / next */}
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Anterior"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-amber-100/90 text-sm font-medium capitalize">{label}</span>
        <button
          type="button"
          onClick={onNext}
          aria-label="Siguiente"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Fila 2: Hoy + Segmented control */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-stone-800/60">
        <button
          type="button"
          onClick={onToday}
          className="text-xs text-amber-200/80 hover:text-amber-100 tracking-wide px-2 py-1 rounded"
        >
          Hoy
        </button>
        <div className="flex rounded-full border border-stone-700/60 overflow-hidden">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onViewChange(opt.key)}
              className={`px-3 py-1.5 text-xs transition-colors ${
                view === opt.key
                  ? 'bg-amber-300/20 text-amber-100 border-amber-300/50'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS. Si `CalendarView` no incluye `'anio'`, chequear `frontend/src/calendar/types.ts` y usar el nombre correcto del `'year'` (puede ser `'año'` o `'anio'`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/calendar/components/ActivityFab.tsx frontend/src/calendar/components/CalendarToolbarMobile.tsx
git commit -m "feat(calendar): CalendarToolbarMobile (2 filas) + ActivityFab flotante"
```

---

## Task 9: ActivityPanelMobile — bottom sheet con drag-to-close

**Files:**
- Create: `frontend/src/calendar/components/ActivityPanelMobile.tsx`

- [ ] **Step 1: Inspeccionar ActivityPanel desktop**

```bash
head -50 "c:/Users/123/Desktop/Kabbalah Space/frontend/src/calendar/components/ActivityPanel.tsx"
```

Identificar las props que recibe — `ActivityPanelMobile` debe aceptar las MISMAS para no romper el contrato en `CalendarModule`. Si la `ActivityForm` se renderiza directamente dentro, usar la misma firma.

- [ ] **Step 2: Crear ActivityPanelMobile.tsx**

```tsx
// frontend/src/calendar/components/ActivityPanelMobile.tsx
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useScrollLock } from '../../shared/hooks/useScrollLock';
import ActivityForm from './ActivityForm';
import type { Activity, SefiraNode } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
  editing: Activity | null;
  pendingSlot: { start: Date; end: Date } | null;
  sefirot: SefiraNode[];
  onSaved: () => void;
  onDeleted: () => void;
  scope?: 'one' | 'series';
  onRequestDeleteScope?: () => void;
  isPremium?: boolean;
  hasGcalSync?: boolean;
};

const SHEET_HEIGHT_VH = 85;
const CLOSE_THRESHOLD_PX = 100;

export default function ActivityPanelMobile({
  open,
  onClose,
  editing,
  pendingSlot,
  sefirot,
  onSaved,
  onDeleted,
  scope,
  onRequestDeleteScope,
  isPremium,
  hasGcalSync,
}: Props) {
  const reduced = useReducedMotion();
  useScrollLock(open);

  function handleDragEnd(_: unknown, info: { offset: { y: number } }) {
    if (info.offset.y > CLOSE_THRESHOLD_PX) onClose();
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="activity-sheet-overlay"
          className="fixed inset-0 z-[90] flex items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="activity-sheet"
            drag={reduced ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDragEnd}
            initial={reduced ? { y: 0 } : { y: '100%' }}
            animate={{ y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={reduced ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full bg-stone-950 rounded-t-3xl border-t border-stone-800/60 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] flex flex-col"
            style={{ height: `${SHEET_HEIGHT_VH}vh` }}
            role="dialog"
            aria-modal="true"
            aria-label="Crear o editar actividad"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-12 h-1 rounded-full bg-stone-600" />
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute top-3 left-3 w-9 h-9 flex items-center justify-center rounded-full bg-stone-900/80 hover:bg-stone-800 text-stone-300"
            >
              <X size={18} />
            </button>

            {/* Form */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
              <ActivityForm
                editing={editing}
                pendingSlot={pendingSlot}
                sefirot={sefirot}
                onSaved={onSaved}
                onDeleted={onDeleted}
                scope={scope}
                onRequestDeleteScope={onRequestDeleteScope}
                isPremium={isPremium}
                hasGcalSync={hasGcalSync}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 3: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS. Si las props de `ActivityForm` difieren (ej. no acepta `isPremium`), ajustar a las props reales que la form actual recibe.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/calendar/components/ActivityPanelMobile.tsx
git commit -m "feat(calendar): ActivityPanelMobile bottom sheet con drag-to-close"
```

---

## Task 10: ActivityForm — verificar inputs full-width

**Files:**
- Modify: `frontend/src/calendar/components/ActivityForm.tsx` (solo si falta `w-full`)

- [ ] **Step 1: Inspeccionar inputs de ActivityForm**

```bash
grep -n "input\|textarea\|select" "c:/Users/123/Desktop/Kabbalah Space/frontend/src/calendar/components/ActivityForm.tsx" | head -30
```

Identificar si los `<input>`, `<textarea>`, `<select>` tienen `w-full` en su `className`.

- [ ] **Step 2: Agregar w-full a los que faltan**

Para cada `<input>` / `<textarea>` / `<select>` que NO tenga `w-full`, agregarlo al `className`. Ejemplo (si encontrás `className="bg-stone-900 ..."`):

```tsx
className="w-full bg-stone-900 ..."
```

Si TODOS ya tienen `w-full`, **no hagas cambios** — pasa directo al commit con mensaje "no-op" o salta la task.

- [ ] **Step 3: Verificar tsc + build (si hubo cambios)**

```bash
cd frontend && npx tsc -b && npm run build
```

- [ ] **Step 4: Commit (si hubo cambios)**

```bash
git add frontend/src/calendar/components/ActivityForm.tsx
git commit -m "fix(calendar): ActivityForm inputs full-width para layout mobile"
```

Si no hubo cambios, omitir el commit y dejar nota en el reporte.

---

## Task 11: CalendarModule — integrar switch desktop/mobile

**Files:**
- Modify: `frontend/src/calendar/CalendarModule.tsx`

- [ ] **Step 1: Agregar imports nuevos**

En el bloque de imports al inicio del archivo, agregar:

```tsx
import { useMediaQuery } from '../shared/hooks/useMediaQuery';
import CalendarToolbarMobile from './components/CalendarToolbarMobile';
import ActivityPanelMobile from './components/ActivityPanelMobile';
import ActivityFab from './components/ActivityFab';
import WeekViewMobile from './views/WeekViewMobile';
import MonthViewMobile from './views/MonthViewMobile';
import YearViewMobile from './views/YearViewMobile';
```

- [ ] **Step 2: Agregar el media query + extender el hook destructure**

Después del `useCalendarRange()` call existente, modificarlo para incluir los nuevos métodos:

```tsx
const { anchor, setAnchor, view, setView, range, goPrev, goNext, goPrevDay, goNextDay, goToday } = useCalendarRange();
```

Y agregar el `useMediaQuery`:

```tsx
const isMobile = useMediaQuery('(max-width: 767px)');
```

- [ ] **Step 3: Agregar la función onEventMove**

Antes del `return` del componente, agregar:

```tsx
async function handleEventMove(id: string, newStart: Date, newEnd: Date) {
  const res = await apiFetch(`/actividades/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inicio: newStart.toISOString(),
      fin: newEnd.toISOString(),
    }),
  });
  if (res.ok) reload();
}
```

- [ ] **Step 4: Switchear toolbar y views en el JSX**

Encontrar el bloque del JSX donde se renderiza `<CalendarToolbar ... />` y reemplazarlo por:

```tsx
{isMobile ? (
  <CalendarToolbarMobile
    date={anchor}
    view={view}
    onPrev={view === 'semana' ? goPrevDay : goPrev}
    onNext={view === 'semana' ? goNextDay : goNext}
    onToday={goToday}
    onViewChange={setView}
  />
) : (
  <CalendarToolbar
    date={anchor}
    view={view}
    onPrev={goPrev}
    onNext={goNext}
    onToday={goToday}
    onViewChange={setView}
    onCreate={openCreate}
  />
)}
```

(Nota: el toolbar mobile usa `goPrevDay`/`goNextDay` en semana porque WeekViewMobile navega día por día. En month/year usa los mismos `goPrev`/`goNext` que desktop.)

Encontrar la renderización de las vistas. Donde está el `ViewMorph` o las 3 vistas condicionales (`{view === 'semana' && <WeekView ... />}` etc.), agregar versión mobile:

```tsx
{isMobile ? (
  <>
    {view === 'semana' && (
      <WeekViewMobile
        date={anchor}
        activities={filteredActivities}
        onPrevDay={goPrevDay}
        onNextDay={goNextDay}
        onSlotClick={(start, end) => {
          setEditing(null);
          setPendingSlot({ start, end });
          setScope('one');
          setPanelOpen(true);
        }}
        onEventClick={openEdit}
        onEventEdit={openEdit}
        onEventDelete={deleteFromMenu}
        onEventMove={handleEventMove}
        gcalEnabled={gcalEnabled}
      />
    )}
    {view === 'mes' && (
      <MonthViewMobile
        date={anchor}
        activities={filteredActivities}
        onPrevMonth={goPrev}
        onNextMonth={goNext}
        onEventClick={openEdit}
        onEventMove={handleEventMove}
      />
    )}
    {view === 'anio' && (
      <YearViewMobile
        date={anchor}
        activities={filteredActivities}
        sefirot={sefirot}
        onPrevYear={goPrev}
        onNextYear={goNext}
        onSelectMonth={(monthDate) => {
          setAnchor(monthDate);
          setView('mes');
        }}
      />
    )}
  </>
) : (
  // ... existing desktop views — leave untouched
)}
```

(El nombre exacto de la view `'anio'` debe coincidir con `CalendarView` en `frontend/src/calendar/types.ts`. Verificar y ajustar.)

Encontrar `<ActivityPanel ... />` y reemplazarlo por:

```tsx
{isMobile ? (
  <ActivityPanelMobile
    open={panelOpen}
    onClose={closePanel}
    editing={editing}
    pendingSlot={pendingSlot}
    sefirot={sefirot}
    onSaved={handleSaved}
    onDeleted={handleDeleted}
    scope={scope}
    onRequestDeleteScope={requestDeleteScopeFromForm}
    isPremium={/* from existing source, e.g. via usePremium */}
    hasGcalSync={gcalEnabled}
  />
) : (
  <ActivityPanel
    // ... existing props
  />
)}
```

Encontrar el botón "Nueva actividad" (parte del `CalendarToolbar` desktop) — en mobile sale del toolbar. Agregar el FAB DESPUÉS del cierre del JSX principal:

```tsx
{isMobile && <ActivityFab onClick={openCreate} />}
```

Posición: idealmente al mismo nivel que `<ActivityPanel/>`, antes del cierre del componente.

- [ ] **Step 5: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS. Si falla por un campo de `ActivityPanelMobile` que no existe en el original (ej. `isPremium`), buscar en `CalendarModule` cómo se obtiene ese dato y pasarlo.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/calendar/CalendarModule.tsx
git commit -m "feat(calendar): CalendarModule switchea entre desktop y mobile via useMediaQuery"
```

---

## Task 12: QA final — build verde + smoke test manual

**Files:** ninguno modificado (solo verificación)

- [ ] **Step 1: Build limpio**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npm run build
```

Expected: PASS. Notar el bundle final — debería estar dentro de los 580 KB (~+3 KB sobre los 577 actuales por el módulo mobile + nuevos hooks). Si supera mucho, revisar imports duplicados.

- [ ] **Step 2: Arrancar dev server + backend**

```bash
# Terminal 1 — backend
cd "c:/Users/123/Desktop/Kabbalah Space/backend"
venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
```

```bash
# Terminal 2 — frontend
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npm run dev
```

- [ ] **Step 3: Smoke test mobile (devtools emulation a 375px ancho)**

Abrir Chrome → F12 → toggle device toolbar → iPhone SE (375×667). Login + entrar al Calendar.

```
[ ] 1. CalendarToolbarMobile aparece (2 filas: nav + view selector + Hoy)
[ ] 2. WeekViewMobile renderiza por default — día actual centrado en el label
[ ] 3. Swipe horizontal a la izquierda → cambia al día siguiente
[ ] 4. Swipe horizontal a la derecha → cambia al día anterior
[ ] 5. Snap-back si el swipe no llega al threshold (50px)
[ ] 6. Tap en un slot vacío de hora → abre ActivityPanelMobile con esa hora preseleccionada
[ ] 7. ActivityPanelMobile sube desde abajo con animación spring
[ ] 8. Drag handle visible arriba del sheet
[ ] 9. Swipe down sobre el sheet (>100px) → se cierra
[ ] 10. Tap en backdrop → se cierra
[ ] 11. Cambiar a vista "Mes" → MonthViewMobile renderiza grid 7×6
[ ] 12. Días con eventos tienen dot ámbar (1-3 events) o "+N" (4+)
[ ] 13. Tap en un día → ring ámbar + lista de eventos del día abajo
[ ] 14. Tap en un chip de evento → abre ActivityPanelMobile en modo edit
[ ] 15. Cambiar a vista "Año" → YearViewMobile renderiza 12 cards apiladas
[ ] 16. Cada card tiene 10 cuadraditos coloreados por sefirá con opacity ~ count
[ ] 17. Tap en una card → cambia a vista "Mes" en ese mes
[ ] 18. FAB con "+" visible bottom-right, sticky en scroll
[ ] 19. Tap en FAB → abre ActivityPanelMobile en modo crear con fecha actual
[ ] 20. Long-press 500ms en un chip de WeekViewMobile → ring ámbar + escala 1.05 (+ haptic si Android)
[ ] 21. Drag del chip a otra hora del mismo día → PATCH dispara, evento se mueve
[ ] 22. Drag fuera de los slots → snap-back, no API call
```

- [ ] **Step 4: Smoke test desktop (asegurar no regresión)**

Cerrar device toolbar (volver a ancho desktop ≥768px). Recargar Calendar.

```
[ ] 23. CalendarToolbar desktop aparece (1 fila con todos los controles)
[ ] 24. WeekView desktop renderiza grid 7 columnas + columna horas
[ ] 25. Click en slot, drag mouse → funcionan como antes
[ ] 26. ActivityPanel desktop (lateral) aparece al crear/editar
[ ] 27. Console limpia (sin errores de los componentes mobile no montados)
```

- [ ] **Step 5: Smoke test edge cases**

```
[ ] 28. Rotar a landscape en mobile (devtools): 667×375. Sigue siendo vista mobile (>=767px era el corte).
[ ] 29. Resize a tablet vertical (768px): cambia a vista desktop seamlessly.
[ ] 30. Enable prefers-reduced-motion en devtools settings → swipes instantáneos, sheet sin spring.
```

Si alguno falla, NO marcar Task 12 como done. Diagnosticar + sub-task para fix + volver al checklist.

- [ ] **Step 6: Push del branch**

```bash
git push origin feat/gcal-sync
```

(O el branch actual de trabajo — confirmar con `git branch --show-current`.)

---

## Self-Review

### Spec coverage
- ✓ § 2 Decisiones (breakpoint 768, componentes separados, drag long-press, FAB, bottom sheet, datetime-local nativo) — tasks 1, 2, 8, 9 + integración 11
- ✓ § 3.1 Layout archivos — todos los nuevos están en tasks 1-9
- ✓ § 3.2 useMediaQuery — task 1
- ✓ § 3.3 CalendarModule integration — task 11
- ✓ § 4 WeekViewMobile (header + grid + swipe + slot click + eventos + long-press) — task 5
- ✓ § 5 MonthViewMobile (grid 7×6 + dots + lista del día + drag chip) — task 6
- ✓ § 6 YearViewMobile (lista de meses + heatmap) — task 7
- ✓ § 7 useLongPress (delay, cancelOnMove, haptic) + integración en CalendarEvent — tasks 2, 4
- ✓ § 8 ActivityPanelMobile (bottom sheet + drag handle + swipe close) — task 9
- ✓ § 9 CalendarToolbarMobile (2 filas) + ActivityFab — task 8
- ✓ § 10 Edge cases — cubiertos en task 12 (smoke test 28-30) + las animaciones respetan reduced motion (tasks 5, 6, 9)
- ✓ § 11 Testing (manual checklist) — task 12

### Type consistency
- `useMediaQuery(query: string): boolean` — task 1, consumido en task 11 con el mismo signature
- `useLongPress<T>(onLongPress, options)` — task 2, integrado en task 4 con `<HTMLDivElement>` type param
- `goPrevDay / goNextDay: () => void` — task 3, consumido en task 5 y task 11
- `enableLongPressDrag?: boolean` + `onMove?: (id, newStart, newEnd) => void` en `CalendarEvent` — task 4, set en task 5
- `CalendarView` viene de `types.ts` — verificar en tasks 8 y 11 (el nombre `'anio'` puede variar)
- `SEFIRA_COLORS` de `shared/tokens.ts` — verificar en task 7

### Placeholder scan
- No "TBD" / "TODO" en steps
- Tasks 8, 9, 11 mencionan "verificar el nombre" o "verificar las props" — son indicaciones legítimas porque dependen del código actual que no leí completo. El paso de implementación incluye el comando `head` / `grep` para hacer la verificación
- Task 10 puede ser un no-op si los inputs ya están full-width — eso es esperado, no un placeholder
