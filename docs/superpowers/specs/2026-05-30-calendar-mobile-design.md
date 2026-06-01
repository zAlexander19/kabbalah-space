# Calendar Mobile — Responsive Redesign

**Fecha:** 2026-05-30
**Alcance:** Hacer usable el módulo Calendar en pantallas menores a 768px (mobile prioritario — `iPhone SE` a `iPhone 15 Pro Max` aprox.). Reemplazo de las 3 vistas (Week, Month, Year) por versiones mobile-first, adaptación del toolbar y del ActivityPanel, e implementación de long-press para mover actividades con el dedo. Desktop UI queda intacta — cero riesgo de regresión. Otros módulos (Espejo, Evolución, Inicio, Cuenta, Premium) quedan out of scope para este spec.

---

## 1. Objetivo y motivación

El Calendar es uno de los flujos centrales de Kabbalah Space (organizar el tiempo por sefirot), pero hoy es inutilizable en mobile:

- **WeekView**: grid de 7 columnas iguales sobre 375px de ancho deja cada día con ~45px de ancho — los chips de actividades son ilegibles, los slots por hora son imposibles de tappear con precisión.
- **MonthView**: el grid 7×5 con eventos completos por celda colapsa visualmente.
- **YearView**: 12 cards en grid no caben.
- **Toolbar**: prev/next + view selector + "Hoy" + "Nueva actividad" todo en una fila — wrappea de forma rota.
- **ActivityPanel**: slide-in lateral no aplica en mobile; debería ser bottom sheet.
- **Drag**: depende de mouse events, no de touch.

La mayoría de los usuarios de una app espiritual/contemplativa la abren desde el celular. Si el Calendar no es usable ahí, la promesa de "organizá tu semana en sefirot" se rompe en el dispositivo más común.

Este spec define un rediseño mobile-first del Calendar — cada vista pensada desde cero para mobile en lugar de adaptar la versión desktop con CSS.

---

## 2. Decisiones tomadas

| Eje | Decisión |
|---|---|
| Breakpoint | `md` de Tailwind (`768px`). Por debajo → mobile UI; por encima → desktop sin cambios |
| Estrategia técnica | Componentes separados (`WeekViewMobile.tsx`, etc.) seleccionados via `useMediaQuery`. NO se usan clases responsive de Tailwind |
| Default view en mobile | `semana` (igual que desktop, ya viene de `useCalendarRange`). Las 3 vistas funcionan en mobile |
| Drag interaction | Long-press de 500ms para activar drag, con haptic feedback (`navigator.vibrate(40)`) y cancelación si el dedo se mueve >10px antes de los 500ms |
| Tap en slot vacío | Abre ActivityPanel con esa fecha/hora preseleccionada (no slot-click rápido — riesgo de mistaps) |
| ActivityPanel | Bottom sheet (slide-up, ~85vh, drag handle arriba, swipe-to-close) en mobile. Misma `ActivityForm` interior |
| Nueva actividad CTA | FAB flotante (sticky bottom-right, z-30) en mobile. Sale del toolbar |
| Date/time picker | `<input type="datetime-local">` nativo del browser |
| Out of scope | Otros módulos (Espejo / Evolución / Inicio / Cuenta / Premium), edición de recurrencias en mobile, drag entre vistas (ej. drag a otro mes) |

---

## 3. Arquitectura

### 3.1 Layout de archivos

**Nuevos:**
```
frontend/src/calendar/
├── views/
│   ├── WeekViewMobile.tsx
│   ├── MonthViewMobile.tsx
│   └── YearViewMobile.tsx
├── components/
│   ├── CalendarToolbarMobile.tsx
│   ├── ActivityPanelMobile.tsx
│   └── ActivityFab.tsx          (FAB flotante para crear actividad)
└── hooks/
    └── useLongPress.ts

frontend/src/shared/hooks/
└── useMediaQuery.ts             (reusable, no específico de Calendar)
```

**Modificados:**
- `frontend/src/calendar/CalendarModule.tsx` — usa `useMediaQuery` para elegir entre toolbar/views/panel desktop o mobile
- `frontend/src/calendar/hooks/useCalendarRange.ts` — agrega `goPrevDay()` / `goNextDay()` para la navegación día-a-día de WeekViewMobile (sin afectar el comportamiento existente de `goPrev` / `goNext`)
- `frontend/src/calendar/components/ActivityForm.tsx` — verificar que los inputs sean `w-full`; agregar la clase si falta
- `frontend/src/calendar/components/CalendarEvent.tsx` — agregar prop `enableLongPressDrag` y la lógica de drag cuando está true

**Sin tocar:**
- `WeekView.tsx`, `MonthView.tsx`, `YearView.tsx` desktop
- `CalendarToolbar.tsx` desktop
- `ActivityPanel.tsx` desktop
- Backend completo (no hay cambios de API — `PATCH /actividades/{id}` ya soporta cambio de fecha/hora desde el drag)

### 3.2 useMediaQuery — hook reusable

```ts
// frontend/src/shared/hooks/useMediaQuery.ts
import { useEffect, useState } from 'react';

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

SSR-safe (chequeo `typeof window`), cleanup explícito, sin dependencias externas.

### 3.3 CalendarModule integration

En `CalendarModule.tsx`, después de los hooks existentes:

```tsx
const isMobile = useMediaQuery('(max-width: 767px)');
```

Y en el JSX:
- `{isMobile ? <CalendarToolbarMobile ... /> : <CalendarToolbar ... />}`
- `{isMobile ? <WeekViewMobile ... /> : <WeekView ... />}` (idem Month, Year)
- `{isMobile ? <ActivityPanelMobile ... /> : <ActivityPanel ... />}`
- `{isMobile && <ActivityFab onClick={openCreate} />}`

Las props que se pasan a las versiones mobile son las **mismas** que las desktop — sin cambios en el contrato del módulo.

---

## 4. WeekViewMobile — un día por pantalla

### Layout

```
┌─────────────────────────────────┐
│  ◀   Jueves 30 May (2026)   ▶  │  ← header con prev/next + label tappable (date picker)
├─────────────────────────────────┤
│ 06:00 │                         │
│ 07:00 │                         │
│ 08:00 │   ┌──────────────┐      │
│ 09:00 │   │ Meditación   │      │  ← actividad posicionada
│ 10:00 │   │ Tiféret      │      │
│ 11:00 │   └──────────────┘      │
│ 12:00 │                         │
│  ...  │                         │
│ 23:00 │                         │
└─────────────────────────────────┘
                                   ↗ swipe izquierda → siguiente día
                                   ↖ swipe derecha  → día anterior
```

### Estructura DOM

```tsx
<motion.div
  drag="x"
  dragConstraints={{ left: 0, right: 0 }}
  dragElastic={0.2}
  onDragEnd={handleDragEnd}
  className="touch-pan-y"   // permite scroll vertical, captura drag horizontal
>
  <header>...prev | label | next...</header>
  <div className="grid" style={{ gridTemplateColumns: '60px 1fr' }}>
    <hour-column />
    <slots-column with-events />
  </div>
</motion.div>
```

### Swipe

- `dragElastic: 0.2` para sensación de "estiramiento" en los bordes.
- `handleDragEnd`: si `offset.x < -50` → `goNext()` (avanza un día — adaptamos `useCalendarRange` para soportar `goNextDay` además de `goNext` que avanza semana). Si `offset.x > 50` → `goPrevDay()`. Si no llega al threshold → snap back con `animate({x:0})`.
- Animación de transición entre días: cross-fade rápido (180ms) cuando el day index cambia.

### Adaptación de `useCalendarRange`

`useCalendarRange` actualmente expone `goPrev` / `goNext` que avanzan por la unidad de la `view` (semana, mes, año). En mobile + view='semana', queremos avanzar de **día en día**, no de semana en semana.

**Decisión**: en lugar de un state nuevo, reutilizamos el `anchor` existente. WeekViewMobile siempre muestra el día equivalente a `anchor`:

- `goPrevDay()` → `setAnchor(addDays(anchor, -1))`
- `goNextDay()` → `setAnchor(addDays(anchor, 1))`

El `range` del `useActivities` se computa sobre la **semana completa que contiene anchor** (igual que hoy en desktop con view='semana'), así los datos siempre incluyen los 7 días alrededor del actual y los swipes no disparan nuevos fetches mientras te mantenés en la misma semana.

Cuando el `anchor` cruza el límite de la semana (ej. del domingo al lunes siguiente), el `range` cambia y `useActivities` refetchea — esto es OK porque ya tiene `AbortController` y debouncing implícito.

WeekView desktop sigue usando `goPrev` / `goNext` que mueven por semana completa. `goPrevDay` / `goNextDay` son **adicionales**, no reemplazan nada.

### Eventos

Misma posición y altura que desktop (HOUR_HEIGHT=56, HOUR_START=6, etc.). Solo cambia el container (1 columna en lugar de 7).

### Tap en slot vacío

`onClick` en cada hour-slot → `openCreate({ start: <hora del slot>, end: <hora + 1h> })`. Reusa el `pendingSlot` existente.

### Long-press en eventos

Ver § 7.

---

## 5. MonthViewMobile — grid compacto + lista del día

### Layout

```
┌─────────────────────────────────┐
│  ◀     Mayo 2026     ▶          │
│  L  M  M  J  V  S  D            │
│  ·  ·  1  2· 3  4  5            │  ← 1 dot = 1-3 eventos
│  6  7  8· 9  10 11 12+          │  ← +N = 4+ eventos
│  13 14 15·16 17 18·19           │
│  20 21 22 23 24·25 26           │  ← día con ring ámbar = seleccionado
│  27 28 29 30 ─  ─  ─            │
├─────────────────────────────────┤
│  Eventos del 30 de mayo         │
│  ┌─────────────────────────┐    │
│  │ 09:00 Meditación        │    │  ← chip compacto
│  │       Tiféret           │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ 18:00 Gym               │    │
│  │       Gueburá           │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
                              ┌──┐
                              │+ │  ← FAB
                              └──┘
```

### Estructura

- Header: prev/next mes + label "Mayo 2026" centrado (tappable → date picker).
- Grid 7×6 (incluye semana adicional para meses largos). Celdas de ~44×44px (touch-target accesible).
- Cada celda: número del día centrado, color según contraste con tema actual. Si el día tiene eventos: dot dorado (1-3 events) o `+N` (4+).
- Día seleccionado: ring ámbar de 2px alrededor de la celda.
- Día actual: número en ámbar bold.
- Tap en una celda → setea `selectedDay` (state local del MonthViewMobile) → muestra la lista de eventos debajo.

### Lista de eventos del día seleccionado

- Header chico: "Eventos del N de Mayo" (texto-stone-300).
- Chips compactos: `[hora] [título]` + nombre de sefirá debajo en color de la sefirá. Cada chip es tappable → abre ActivityPanel en modo editar.
- Si el día seleccionado no tiene eventos: empty state "Nada agendado para este día".

### Long-press en chips

Long-press en un chip → activa modo drag. El usuario puede arrastrar el chip de vuelta al grid del mes → soltar sobre otro día reagenda el evento. Si lo suelta fuera del grid → cancel.

(En mobile no permitimos cambiar la hora vía drag — solo la fecha. Para cambiar hora el usuario abre el editor.)

---

## 6. YearViewMobile — lista de meses con heatmap

### Layout

```
┌────────────────────────────────┐
│         2026                   │  ← header con prev/next año
├────────────────────────────────┤
│ Enero                          │
│  ▮▮▮▮▮▮▮▮▮▮  (10 sefirot)     │  ← heatmap horizontal
├────────────────────────────────┤
│ Febrero                        │
│  ▮▮▮▮▮▮▮▮▮▮                   │
├────────────────────────────────┤
│ Marzo                          │
│  ▮▮▮▮▮▮▮▮▮▮                   │
│ ...                            │
└────────────────────────────────┘
```

### Estructura

- Lista vertical scrolleable de 12 cards.
- Cada card:
  - Nombre del mes + año (si distinto del año actual): "Mayo 2026".
  - Heatmap horizontal: 10 cuadraditos de 24×24px, una por sefirá, en orden estándar (Kéter → Maljut).
  - Color de cada cuadradito: el color base de la sefirá (`SEFIRA_COLORS`), con `opacity` proporcional al conteo de actividades del mes para esa sefirá. Conteo 0 → opacity 0.15. Conteo ≥10 → opacity 1.
  - Card tappable → `setView('mes')` + `setAnchor(startOfMonth(esemMes))` → cambia a MonthViewMobile en ese mes.
- Sticky scroll position: cuando volvés desde MonthViewMobile, scrolleas al mes desde el que entraste (scroll-into-view).

### Datos

Se reusa el endpoint actual `/actividades?start=...&end=...` con un rango de un año completo. El conteo por (mes, sefirá) se calcula en el cliente con un `useMemo` sobre `activities`.

---

## 7. Long-press drag — implementación

### Hook `useLongPress.ts`

```ts
import { useCallback, useRef } from 'react';

interface LongPressOptions {
  delay?: number;          // default 500ms
  cancelOnMove?: boolean;  // default true
  moveThreshold?: number;  // default 10px
}

export function useLongPress<T extends HTMLElement>(
  onLongPress: (e: React.PointerEvent<T>) => void,
  options: LongPressOptions = {},
) {
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

  const onPointerDown = useCallback((e: React.PointerEvent<T>) => {
    startRef.current = { x: e.clientX, y: e.clientY };
    triggeredRef.current = false;
    timerRef.current = window.setTimeout(() => {
      triggeredRef.current = true;
      if (typeof navigator.vibrate === 'function') navigator.vibrate(40);
      onLongPress(e);
    }, delay);
  }, [delay, onLongPress]);

  const onPointerUp = clear;
  const onPointerLeave = clear;

  const onPointerMove = useCallback((e: React.PointerEvent<T>) => {
    if (!cancelOnMove || !startRef.current || triggeredRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.hypot(dx, dy) > moveThreshold) clear();
  }, [cancelOnMove, moveThreshold, clear]);

  return { onPointerDown, onPointerUp, onPointerLeave, onPointerMove };
}
```

### Integración en CalendarEvent

Agregar prop opcional `enableLongPressDrag?: boolean`. Cuando `true`:

1. Usar `useLongPress` apuntando a `handleStartDrag`.
2. `handleStartDrag` setea state `dragging=true` y agrega clase visual (`ring-amber-300/60 scale-105 z-50 shadow-amber-300/40`).
3. Cuando `dragging=true`, montar un `<motion.div drag onDragEnd={handleDrop}>` clonado del chip que sigue al puntero.
4. `handleDrop`: calcular sobre qué slot/celda cayó usando `elementsFromPoint(e.clientX, e.clientY)` + `data-slot` attribute en cada slot/celda. Si hay match → `onMove(act.id, newStart, newEnd)`; si no → snap-back animation.
5. `CalendarModule` provee `onMove` que llama a `PATCH /actividades/{id}` con la nueva fecha.

### CSS

- Durante drag: `touch-action: none` en el contenedor de la vista para que el navegador no scrollee.
- `cursor: grabbing` solo si pointer-type es mouse (no aplica a touch, pero por consistencia).

---

## 8. ActivityPanelMobile — bottom sheet

### Estructura

```tsx
<AnimatePresence>
  {open && (
    <motion.div className="fixed inset-0 z-[90]">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/60"
        initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
        onClick={onClose}
      />
      {/* Sheet */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.4}
        onDragEnd={handleDragClose}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 h-[85vh] bg-stone-950 rounded-t-3xl flex flex-col"
      >
        <div className="w-12 h-1 bg-stone-600 rounded-full mx-auto mt-3" />  {/* drag handle */}
        <button onClick={onClose} className="absolute top-3 left-3">✕</button>
        <ActivityForm ... />
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

### Comportamiento

- `dragConstraints.top: 0` permite arrastrar solo hacia abajo (cerrar).
- `handleDragClose`: si `offset.y > 100` → `onClose()`. Si no → snap back.
- Backdrop tappable → `onClose()`.
- Botón "Guardar" del form queda sticky abajo con `position: sticky; bottom: 0` dentro del sheet, sobre fondo del mismo color para que se mantenga visible al scrollear inputs.

### ActivityForm interior

Sin cambios estructurales. Asumimos que los inputs ya son `w-full` (verificar en código antes de implementar — si no lo son, agregarlo a la modificación de ActivityForm.tsx).

---

## 9. CalendarToolbarMobile

### Estructura (2 filas)

```
┌─────────────────────────────────┐
│  ◀     Mayo 2026     ▶          │  ← Fila 1: prev/label/next
│ Hoy  [Semana|Mes|Año]            │  ← Fila 2: hoy + segmented control
└─────────────────────────────────┘
```

### Detalles

- **Fila 1** (`flex justify-between items-center px-4 py-2`):
  - Prev `<` button (28×28 touch target)
  - Label central: dinámico según view. Tap → input date picker invisible que `.click()`-eamos para abrir.
  - Next `>` button
- **Fila 2** (`flex justify-between items-center px-4 py-2 border-t border-stone-800`):
  - "Hoy" button (text-amber-200/80, text-xs)
  - Segmented control de 3 opciones (Semana / Mes / Año) — usa `radio buttons` accesibles + estilos custom. Selected: bg-amber-300/20 border-amber-300/50. Unselected: text-stone-400.
- **NO** incluye "Nueva actividad" — eso vive como FAB separado.

### ActivityFab

Componente simple:

```tsx
<button
  onClick={onClick}
  className="fixed bottom-6 right-4 z-30 w-14 h-14 rounded-full
             bg-gradient-to-br from-amber-200 to-amber-400 text-stone-900
             shadow-[0_8px_24px_rgba(233,195,73,0.4)]
             flex items-center justify-center text-2xl"
  aria-label="Crear actividad"
>
  +
</button>
```

Posición fixed → visible en cualquier scroll position. Cuando `ActivityPanelMobile` está abierto, el FAB queda detrás del backdrop (z-30 < z-90).

---

## 10. Edge cases

### 10.1 Orientación landscape

Si el usuario rota a landscape en un móvil chico (ej. 667×375), el ancho efectivo cruza los 640px pero queda debajo de 768. `useMediaQuery('(max-width: 767px)')` sigue devolviendo `true` → vista mobile. Esto es correcto: 667px de ancho con vista mobile sigue siendo más usable que tratar de meter la desktop UI ahí.

Cuando supera 768px (tablet vertical iPad estándar), pasa a desktop UI. La transición es seamless (cambia el componente renderizado).

### 10.2 Tap muy cerca del borde durante swipe horizontal

WeekViewMobile usa Framer Motion drag con `dragElastic: 0.2`. Tap rápidos (menos de 100ms entre down y up + menos de 10px de movimiento) no se interpretan como drag — el `onTap` del chip dispara normal. Threshold de drag: 50px.

### 10.3 Pull-to-refresh en iOS Safari

En WeekViewMobile, el container tiene `overscroll-behavior: contain` para evitar que el swipe horizontal a la izquierda en el primer slot dispare el pull-to-refresh nativo.

### 10.4 Reduced motion

`useReducedMotion()` de Framer Motion:
- Swipes entre días en WeekViewMobile: instantáneos (sin spring), solo cross-fade de 100ms.
- ActivityPanel sheet: aparece instantáneo en lugar de slide-up animado.
- Long-press feedback visual: sigue funcionando (es funcional, no decorativo), pero sin la animación de escalado.

### 10.5 Date picker nativo en iOS

`<input type="datetime-local">` funciona en iOS 14+ con un picker propio. El estilo visual lo controla el OS — no podemos customizarlo. Aceptable porque es el patrón que el usuario ya conoce.

### 10.6 Long-press sobre chip + scroll vertical

Cuando el long-press está activo (state `dragging=true` en CalendarEvent), agregamos `touch-action: none` en el contenedor de la vista. Esto previene scroll. Al soltar (drag end), revertimos.

### 10.7 Cancel del long-press al recibir notificación / cambio de orientación

`onPointerLeave` del hook captura cuando el puntero sale del elemento — incluye situaciones donde el browser interrumpe el evento. El timer se limpia. Si el browser detiene un long-press a medias, el chip vuelve a su estado normal sin glitches.

### 10.8 Cambio de día seleccionado en MonthViewMobile mientras hay un long-press activo

No debería pasar porque el long-press requiere el dedo quieto. Si pasa por un bug futuro: el `dragging` state vive en el chip individual, no en el MonthViewMobile — el `selectedDay` puede cambiar sin afectar al chip que estoy moviendo.

---

## 11. Testing

### 11.1 Verificación automatizada

Frontend no tiene framework de tests configurado — solo `tsc -b` y `vite build`. Para esta feature no se justifica traer Vitest.

### 11.2 Smoke test manual

Checklist en un dispositivo real (preferiblemente iPhone + un Android) y en DevTools mobile emulation:

```
[ ] @ 375px wide: el toolbar mobile renderiza en 2 filas, no se desborda
[ ] WeekViewMobile: el día actual se muestra centrado, prev/next funcionan
[ ] WeekViewMobile: swipe horizontal cambia el día, snap-back si no llega al threshold
[ ] WeekViewMobile: tap en slot vacío abre ActivityPanelMobile con la hora correcta
[ ] WeekViewMobile: long-press de 500ms en un chip activa drag con haptic (Android)
[ ] WeekViewMobile: drag de un chip a otra hora del mismo día → PATCH se dispara, evento se mueve
[ ] WeekViewMobile: drag fuera del grid → snap-back, no API call
[ ] MonthViewMobile: grid 7×6 con números legibles, dots/+N visibles
[ ] MonthViewMobile: tap en día → selecciona + muestra lista debajo
[ ] MonthViewMobile: long-press en chip + drag a otro día → PATCH dispara con fecha cambiada
[ ] YearViewMobile: lista de 12 meses scrolleable, heatmap visible
[ ] YearViewMobile: tap en mes → cambia a MonthViewMobile en ese mes
[ ] ActivityPanelMobile: sheet sube desde abajo con animación
[ ] ActivityPanelMobile: swipe down sobre el handle → se cierra
[ ] ActivityPanelMobile: tap en backdrop → se cierra
[ ] FAB: visible en bottom-right en las 3 vistas mobile, no oculta contenido al scrollear
[ ] FAB: tap → abre ActivityPanelMobile en modo crear con fecha actual
[ ] Rotación landscape (640-767px): sigue siendo vista mobile, layout no se rompe
[ ] Cambio a desktop (≥768px en emulación): cambia a CalendarToolbar + WeekView/MonthView/YearView clásicos, ningún console error
[ ] prefers-reduced-motion: ON → swipes son cross-fade instantáneo, sheet sin slide
[ ] iOS Safari: pull-to-refresh no se dispara cuando swipeás horizontalmente
[ ] Edge case: dejar el long-press a medias (mover el dedo >10px antes de los 500ms) → cancela correctamente
```

### 11.3 Backend

No hay cambios. Los tests existentes del backend (214/214) siguen verdes.

---

## 12. Out of scope (Future)

- **Espejo, Evolución, Inicio, Cuenta, Premium** mobile — cada uno necesita su propio spec
- **Tablet ≥ 768px con UX dedicada** — hoy ven la desktop UI; está OK por ahora
- **Edición de recurrencias en mobile** — el flujo de RecurrencePicker + RecurrenceScopeDialog ya es complejo en desktop; en mobile requiere repensar UX
- **Drag entre vistas** (ej. drag en MonthView arrastrar a un día del mes siguiente) — solo permitimos drag dentro del mes/semana visible
- **Pinch-to-zoom** entre vistas (gesture común en calendars nativos) — no implementamos
- **Notificaciones push** para recordatorios — fuera del scope de responsive

---

## 13. Relacionado

- [project_gcal_sync](memory) — la rama `feat/gcal-sync` con todo el trabajo previo está en PR #42
- [2026-04-25-calendario-cabalistico-redesign-design.md](./2026-04-25-calendario-cabalistico-redesign-design.md) — spec original del Calendar (desktop)
- [2026-05-14-gcal-one-way-sync-design.md](./2026-05-14-gcal-one-way-sync-design.md) — sync con Google Calendar que afecta visibilidad de chips
