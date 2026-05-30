# Onboarding Tour del Espejo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar tour interactivo de 5 pasos (coachmarks contextuales) que se dispara automáticamente la primera vez que un usuario nuevo entra al módulo Espejo, después de la animación `EspejoIntro`. Cubre el flujo crítico: ver el árbol → click en sefirá → responder preguntas guía → escribir reflexión → ver historial. Bloquea la navegación a otros módulos mientras está activo.

**Architecture:** Módulo nuevo `frontend/src/onboarding/` con Context + Tooltip component + steps config + hook de registro de targets. Estado persistido en `localStorage.tour_espejo_done`. Sin librería externa de tours — implementación custom con Framer Motion (ya en bundle) y posicionamiento via `getBoundingClientRect()`. La navegación se bloquea con dos capas: visual en `InicioNav.tsx` (tabs disabled) + interceptación en `setActiveView` de `App.tsx`. El tooltip se renderiza vía portal a nivel root y un único `MutationObserver` lo auto-pausa cuando aparece un modal con z-index superior.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind 4 + Framer Motion. Sin tests automatizados (no hay framework configurado en el frontend) — verificación por **TypeScript compile** (`tsc -b`), **build OK** (`npm run build`), y **smoke test manual** del checklist de 16 puntos al final.

**Spec de referencia:** [docs/superpowers/specs/2026-05-30-onboarding-tour-espejo-design.md](../specs/2026-05-30-onboarding-tour-espejo-design.md)

---

## File Structure

### Archivos nuevos
- `frontend/src/onboarding/tour-espejo-steps.ts` — config declarativa de los 5 pasos del tour
- `frontend/src/onboarding/TourEspejoContext.tsx` — Context Provider + hook `useTourEspejo()`
- `frontend/src/onboarding/useTourStep.ts` — hook para que componentes anuncien sus elementos como target
- `frontend/src/onboarding/TourTooltip.tsx` — el único tooltip que se renderiza, vía portal a `document.body`
- `frontend/src/onboarding/index.ts` — barrel export

### Archivos modificados
- `frontend/src/App.tsx` — envolver con `<TourEspejoProvider>`, renderizar `<TourTooltip />`, interceptar `setActiveView`
- `frontend/src/espejo/EspejoModule.tsx` — disparar `tour.start()` en `handleIntroComplete` si no está el flag; `tour.skip()` en cleanup
- `frontend/src/espejo/components/SefirotInteractiveTree.tsx` — `useTourStep` para árbol y Tiferet
- `frontend/src/espejo/components/QuestionCard.tsx` — prop `isFirstVisible?: boolean` + `useTourStep` cuando true
- `frontend/src/espejo/components/SefiraDetailPanel.tsx` — pasar `isFirstVisible` al primer QuestionCard (verificar en código qué componente itera)
- `frontend/src/espejo/components/ReflectionEditor.tsx` — `useTourStep` para el root del editor
- `frontend/src/espejo/components/HistoryList.tsx` — `useTourStep` para el root del list
- `frontend/src/inicio/components/InicioNav.tsx` — disabled visual en tabs no-Espejo cuando `tour.isActive`

### NOT en este plan
- Tours para otros módulos (Calendario, Evolución, etc.)
- Botón on-demand "Ver tour" en `/cuenta`
- Persistencia cross-device (backend column)
- Vitest + React Testing Library (decisión separada)

---

## Task 1: Steps config declarativa

**Files:**
- Create: `frontend/src/onboarding/tour-espejo-steps.ts`

- [ ] **Step 1: Crear el archivo con la config de los 5 pasos**

```typescript
// frontend/src/onboarding/tour-espejo-steps.ts

export type StepId = 1 | 2 | 3 | 4 | 5;

export type StepPlacement = 'top' | 'bottom' | 'left' | 'right';

export type StepMode = 'linear' | 'contextual';

export type StepAdvanceOn = 'target-click' | 'target-focus' | 'next-button';

export interface TourStep {
  id: StepId;
  targetId: string;
  copy: string;
  placement: StepPlacement;
  mode: StepMode;
  advanceOn: StepAdvanceOn;
  autoCloseAfterMs?: number;
}

export const STEPS: readonly TourStep[] = [
  {
    id: 1,
    targetId: 'espejo-tree-root',
    copy: 'Este es tu Árbol de la Vida. 10 dimensiones del alma.',
    placement: 'right',
    mode: 'linear',
    advanceOn: 'next-button',
  },
  {
    id: 2,
    targetId: 'espejo-sefira-tiferet',
    copy: 'Hacé click en cualquier sefirá para entrar.',
    placement: 'right',
    mode: 'linear',
    advanceOn: 'target-click',
  },
  {
    id: 3,
    targetId: 'espejo-pregunta-textarea',
    copy: 'Respondé desde lo que estás viviendo.',
    placement: 'bottom',
    mode: 'contextual',
    advanceOn: 'target-focus',
  },
  {
    id: 4,
    targetId: 'espejo-reflection-editor',
    copy: 'Acá escribís tu reflexión libre y nivelás la energía.',
    placement: 'left',
    mode: 'contextual',
    advanceOn: 'target-click',
  },
  {
    id: 5,
    targetId: 'espejo-history-list',
    copy: 'Acá vas a ver todas tus reflexiones pasadas. Click en cualquiera para revisitarla.',
    placement: 'top',
    mode: 'contextual',
    advanceOn: 'target-click',
    autoCloseAfterMs: 30000,
  },
] as const;

export const TOUR_DONE_FLAG = 'tour_espejo_done';
```

- [ ] **Step 2: Verificar que tsc compila**

Run: `cd frontend && npx tsc -b`
Expected: PASS (sin errores).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/onboarding/tour-espejo-steps.ts
git commit -m "feat(onboarding): tour-espejo-steps config con los 5 pasos del MVP"
```

---

## Task 2: TourEspejoContext con state y acciones

**Files:**
- Create: `frontend/src/onboarding/TourEspejoContext.tsx`

- [ ] **Step 1: Crear el Context con Provider y hook**

```tsx
// frontend/src/onboarding/TourEspejoContext.tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import { STEPS, TOUR_DONE_FLAG, type StepId } from './tour-espejo-steps';

interface TourEspejoContextValue {
  isActive: boolean;
  currentStep: StepId | null;
  start: () => void;
  next: () => void;
  skip: () => void;
  registerTarget: (stepId: StepId, ref: RefObject<HTMLElement>) => () => void;
  getTargetRef: (stepId: StepId) => RefObject<HTMLElement> | null;
}

const TourEspejoContext = createContext<TourEspejoContextValue | null>(null);

function isDone(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_FLAG) === '1';
  } catch {
    return false;
  }
}

function markDone() {
  try {
    localStorage.setItem(TOUR_DONE_FLAG, '1');
  } catch {
    /* localStorage may be unavailable (private mode) — silently noop */
  }
}

export function TourEspejoProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepId | null>(null);

  // Stored in a ref + version counter so re-renders only happen when consumers
  // actually need them (mounting/unmounting a step target).
  const targetsRef = useRef<Map<StepId, RefObject<HTMLElement>>>(new Map());
  const [targetsVersion, setTargetsVersion] = useState(0);

  const start = useCallback(() => {
    if (isDone()) return;
    setCurrentStep(1);
    setIsActive(true);
  }, []);

  const finish = useCallback(() => {
    markDone();
    setIsActive(false);
    setCurrentStep(null);
  }, []);

  const next = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev === null) return null;
      const nextId = (prev + 1) as StepId;
      if (nextId > STEPS.length) {
        markDone();
        setIsActive(false);
        return null;
      }
      return nextId;
    });
  }, []);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const registerTarget = useCallback(
    (stepId: StepId, ref: RefObject<HTMLElement>) => {
      targetsRef.current.set(stepId, ref);
      setTargetsVersion((v) => v + 1);
      return () => {
        const current = targetsRef.current.get(stepId);
        if (current === ref) {
          targetsRef.current.delete(stepId);
          setTargetsVersion((v) => v + 1);
        }
      };
    },
    [],
  );

  const getTargetRef = useCallback(
    (stepId: StepId): RefObject<HTMLElement> | null => {
      return targetsRef.current.get(stepId) ?? null;
    },
    // targetsVersion is intentionally in deps so consumers re-read after register/unregister.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetsVersion],
  );

  const value = useMemo<TourEspejoContextValue>(
    () => ({
      isActive,
      currentStep,
      start,
      next,
      skip,
      registerTarget,
      getTargetRef,
    }),
    [isActive, currentStep, start, next, skip, registerTarget, getTargetRef],
  );

  return <TourEspejoContext.Provider value={value}>{children}</TourEspejoContext.Provider>;
}

export function useTourEspejo(): TourEspejoContextValue {
  const ctx = useContext(TourEspejoContext);
  if (ctx === null) {
    throw new Error('useTourEspejo must be used inside <TourEspejoProvider>');
  }
  return ctx;
}
```

- [ ] **Step 2: Verificar tsc**

Run: `cd frontend && npx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/onboarding/TourEspejoContext.tsx
git commit -m "feat(onboarding): TourEspejoContext con start/next/skip + register de targets"
```

---

## Task 3: Hook useTourStep para registro de targets

**Files:**
- Create: `frontend/src/onboarding/useTourStep.ts`

- [ ] **Step 1: Crear el hook**

```typescript
// frontend/src/onboarding/useTourStep.ts
import { useEffect, type RefObject } from 'react';

import { useTourEspejo } from './TourEspejoContext';
import type { StepId } from './tour-espejo-steps';

/**
 * Registers the given ref as the target element of step `stepId`.
 *
 * Only runs when the tour is active — zero overhead during regular use of the
 * app. Re-registers if the ref or stepId changes. Cleans up on unmount, which
 * is what lets the tooltip silently wait when a target's component hasn't
 * mounted yet (e.g. the question carousel only mounts after the user clicks a
 * sefirá).
 */
export function useTourStep(stepId: StepId, ref: RefObject<HTMLElement>): void {
  const tour = useTourEspejo();
  useEffect(() => {
    if (!tour.isActive) return;
    const cleanup = tour.registerTarget(stepId, ref);
    return cleanup;
  }, [tour.isActive, stepId, ref, tour.registerTarget]);
}
```

- [ ] **Step 2: Verificar tsc**

Run: `cd frontend && npx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/onboarding/useTourStep.ts
git commit -m "feat(onboarding): useTourStep hook para registrar elementos como targets"
```

---

## Task 4: TourTooltip — render, positioning, animaciones

**Files:**
- Create: `frontend/src/onboarding/TourTooltip.tsx`

- [ ] **Step 1: Crear el componente con positioning + animaciones + modos**

```tsx
// frontend/src/onboarding/TourTooltip.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { useTourEspejo } from './TourEspejoContext';
import { STEPS, type StepPlacement, type TourStep } from './tour-espejo-steps';

const ease = [0.16, 1, 0.3, 1] as const;

const TOOLTIP_WIDTH = 280;
const TOOLTIP_OFFSET = 12; // distance from target rect edge
const MOBILE_BREAKPOINT = 640;
const VIEWPORT_PADDING = 8;

type Position = { top: number; left: number; placement: StepPlacement };

function computePosition(
  rect: DOMRect,
  preferred: StepPlacement,
  viewport: { w: number; h: number },
  tooltipHeight: number,
): Position {
  const isMobile = viewport.w < MOBILE_BREAKPOINT;
  if (isMobile) {
    // On mobile, place below if it fits, otherwise above. Keeps the tooltip
    // visually connected to the target (e.g. paso 5 — historial — is near the
    // bottom of the page).
    const placeBelow = rect.bottom + TOOLTIP_OFFSET + tooltipHeight + VIEWPORT_PADDING <= viewport.h;
    return placeBelow
      ? { top: rect.bottom + TOOLTIP_OFFSET, left: VIEWPORT_PADDING, placement: 'bottom' }
      : { top: Math.max(VIEWPORT_PADDING, rect.top - TOOLTIP_OFFSET - tooltipHeight), left: VIEWPORT_PADDING, placement: 'top' };
  }

  const tryPlacement = (p: StepPlacement): Position | null => {
    let top = 0;
    let left = 0;
    if (p === 'right') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + TOOLTIP_OFFSET;
    } else if (p === 'left') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - TOOLTIP_OFFSET - TOOLTIP_WIDTH;
    } else if (p === 'top') {
      top = rect.top - TOOLTIP_OFFSET - tooltipHeight;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    } else {
      top = rect.bottom + TOOLTIP_OFFSET;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    }
    // Check it fits inside viewport (with padding).
    if (
      top < VIEWPORT_PADDING ||
      left < VIEWPORT_PADDING ||
      top + tooltipHeight > viewport.h - VIEWPORT_PADDING ||
      left + TOOLTIP_WIDTH > viewport.w - VIEWPORT_PADDING
    ) {
      return null;
    }
    return { top, left, placement: p };
  };

  const opposite: Record<StepPlacement, StepPlacement> = {
    right: 'left',
    left: 'right',
    top: 'bottom',
    bottom: 'top',
  };

  return (
    tryPlacement(preferred) ??
    tryPlacement(opposite[preferred]) ?? {
      // Fallback: clamp to bottom of the viewport.
      top: viewport.h - tooltipHeight - VIEWPORT_PADDING,
      left: Math.max(VIEWPORT_PADDING, Math.min(rect.left, viewport.w - TOOLTIP_WIDTH - VIEWPORT_PADDING)),
      placement: 'bottom',
    }
  );
}

function ArrowSvg({ placement }: { placement: StepPlacement }) {
  // Triangle pointing toward the target. CSS rotation based on placement.
  const rotate = {
    right: 0,
    left: 180,
    top: 90,
    bottom: -90,
  }[placement];
  const style: React.CSSProperties = {
    position: 'absolute',
    width: 12,
    height: 12,
    transform: `rotate(${rotate}deg)`,
    ...(placement === 'right' ? { left: -6, top: '50%', marginTop: -6 } : {}),
    ...(placement === 'left' ? { right: -6, top: '50%', marginTop: -6 } : {}),
    ...(placement === 'top' ? { bottom: -6, left: '50%', marginLeft: -6 } : {}),
    ...(placement === 'bottom' ? { top: -6, left: '50%', marginLeft: -6 } : {}),
  };
  return (
    <svg viewBox="0 0 12 12" style={style} aria-hidden="true">
      <polygon points="12,0 0,6 12,12" fill="#0c0d11" stroke="rgba(233,195,73,0.4)" strokeWidth="1" />
    </svg>
  );
}

export function TourTooltip() {
  const tour = useTourEspejo();
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState<Position | null>(null);
  const [viewport, setViewport] = useState({
    w: typeof window === 'undefined' ? 1024 : window.innerWidth,
    h: typeof window === 'undefined' ? 768 : window.innerHeight,
  });

  const step = useMemo<TourStep | null>(() => {
    if (!tour.isActive || tour.currentStep === null) return null;
    return STEPS.find((s) => s.id === tour.currentStep) ?? null;
  }, [tour.isActive, tour.currentStep]);

  const targetRef = step ? tour.getTargetRef(step.id) : null;
  const targetEl = targetRef?.current ?? null;

  // Recompute position whenever the step, target element, or viewport changes.
  useLayoutEffect(() => {
    if (!step || !targetEl) {
      setPosition(null);
      return;
    }
    const update = () => {
      const rect = targetEl.getBoundingClientRect();
      // Approximate tooltip height — copy length and step mode determine it.
      const approxHeight = step.mode === 'linear' ? 160 : 110;
      setPosition(computePosition(rect, step.placement, viewport, approxHeight));
    };
    update();
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setViewport({ w, h });
      const rect = targetEl.getBoundingClientRect();
      const approxHeight = step.mode === 'linear' ? 160 : 110;
      setPosition(computePosition(rect, step.placement, { w, h }, approxHeight));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', update, true);
    };
  }, [step, targetEl, viewport.w, viewport.h]);

  // Attach advance listener for contextual / target-click steps.
  // tour.next is stashed in a ref so we don't re-attach the listener on every
  // context value change (which would happen each time targetsVersion bumps).
  const nextRef = useRef(tour.next);
  useEffect(() => {
    nextRef.current = tour.next;
  }, [tour.next]);
  useEffect(() => {
    if (!step || !targetEl) return;
    if (step.advanceOn === 'next-button') return;
    const handler = () => nextRef.current();
    const eventName = step.advanceOn === 'target-focus' ? 'focus' : 'click';
    targetEl.addEventListener(eventName, handler, { once: true });
    return () => targetEl.removeEventListener(eventName, handler);
  }, [step, targetEl]);

  // Auto-close timer for the last step (paso 5) when target never appears or
  // user doesn't interact.
  useEffect(() => {
    if (!step || !step.autoCloseAfterMs) return;
    const timer = setTimeout(() => tour.skip(), step.autoCloseAfterMs);
    return () => clearTimeout(timer);
  }, [step, tour]);

  if (!step || !position) return null;

  const motionDuration = reducedMotion ? 0 : 0.22;

  return createPortal(
    <AnimatePresence mode="wait">
      <motion.div
        key={step.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: motionDuration, ease }}
        className="fixed z-[80] pointer-events-none"
        style={{
          top: position.top,
          left: position.left,
          width: viewport.w < MOBILE_BREAKPOINT ? viewport.w - VIEWPORT_PADDING * 2 : TOOLTIP_WIDTH,
        }}
        role="dialog"
        aria-modal="false"
        aria-label={`Tour del Espejo, paso ${step.id} de ${STEPS.length}`}
      >
        <div
          className="relative pointer-events-auto rounded-2xl bg-stone-950/95 border border-amber-300/40 shadow-[0_24px_60px_rgba(0,0,0,0.6)] px-5 py-4 backdrop-blur-md"
        >
          <ArrowSvg placement={position.placement} />
          <p className="text-[10px] uppercase tracking-[0.2em] text-amber-200/70 mb-2">
            Paso {step.id} de {STEPS.length}
          </p>
          <p className="font-serif text-base text-amber-50 leading-snug mb-4">{step.copy}</p>
          {step.mode === 'linear' && (
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={tour.skip}
                className="text-xs text-stone-400 hover:text-stone-200 tracking-wide transition-colors"
              >
                Saltar tour
              </button>
              {step.advanceOn === 'next-button' && (
                <button
                  type="button"
                  onClick={tour.next}
                  className="px-4 py-1.5 rounded-full bg-amber-300/20 hover:bg-amber-300/35 border border-amber-300/50 text-amber-50 text-xs tracking-wide transition-colors"
                >
                  Siguiente →
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 2: Verificar tsc**

Run: `cd frontend && npx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/onboarding/TourTooltip.tsx
git commit -m "feat(onboarding): TourTooltip con positioning + animations + modos lineal/contextual"
```

---

## Task 5: Pausa por modales (MutationObserver) + barrel export

**Files:**
- Modify: `frontend/src/onboarding/TourTooltip.tsx`
- Create: `frontend/src/onboarding/index.ts`

- [ ] **Step 1: Agregar lógica de pausa por modales en TourTooltip.tsx**

Buscar el bloque `// Auto-close timer for the last step ...` y agregar JUSTO DESPUÉS de ese efecto, antes del `if (!step || !position) return null;`:

```tsx
  // Auto-pause when a higher-z modal opens (PremiumGate z-100, AnswersGridModal
  // z-110, etc). We don't reposition or remount — we just hide the tooltip and
  // let it reappear when the modal closes.
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!tour.isActive) return;
    const check = () => {
      const modals = document.querySelectorAll('[aria-modal="true"]');
      setIsPaused(modals.length > 0);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    return () => observer.disconnect();
  }, [tour.isActive]);
```

Y modificar el `<motion.div>` para que cuando `isPaused` sea true se haga invisible:

Reemplazar:
```tsx
        animate={{ opacity: 1, scale: 1 }}
```
por:
```tsx
        animate={{ opacity: isPaused ? 0 : 1, scale: isPaused ? 0.95 : 1 }}
```

- [ ] **Step 2: Crear el barrel index.ts**

```typescript
// frontend/src/onboarding/index.ts
export { TourEspejoProvider, useTourEspejo } from './TourEspejoContext';
export { TourTooltip } from './TourTooltip';
export { useTourStep } from './useTourStep';
export type { StepId } from './tour-espejo-steps';
```

- [ ] **Step 3: Verificar tsc**

Run: `cd frontend && npx tsc -b`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/onboarding/TourTooltip.tsx frontend/src/onboarding/index.ts
git commit -m "feat(onboarding): pausa automática del tooltip por modales superpuestos + barrel"
```

---

## Task 6: Wire SefirotInteractiveTree — registrar paso 1 (árbol) y paso 2 (Tiferet)

**Files:**
- Modify: `frontend/src/espejo/components/SefirotInteractiveTree.tsx`

- [ ] **Step 1: Leer el archivo actual para identificar el root del árbol y la sefirá Tiferet**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend/src/espejo/components"
head -50 SefirotInteractiveTree.tsx
```

Tomar nota: el componente debería renderizar un `<svg>` o `<div>` root, y dentro un loop sobre `sefirot.map(...)`. Identificar dónde se renderiza el nodo Tiferet (el de centro, `id === 'tiferet'`).

- [ ] **Step 2: Agregar refs y registrar como targets**

En los imports al inicio del archivo:
```tsx
import { useRef } from 'react';
import { useTourStep } from '../../onboarding';
```

Dentro del componente, justo después de la signatura:
```tsx
  const treeRootRef = useRef<HTMLDivElement>(null);
  const tiferetRef = useRef<HTMLElement>(null);
  useTourStep(1, treeRootRef as React.RefObject<HTMLElement>);
  useTourStep(2, tiferetRef);
```

Aplicar el `treeRootRef` al elemento raíz del árbol (probablemente el `<div>` o `<svg>` outermost). Si es un `<svg>`, cambiar el tipo del ref a `useRef<SVGSVGElement>(null)` y castear el `as RefObject<HTMLElement>` en el `useTourStep`.

Aplicar el `tiferetRef` al elemento DOM del nodo Tiferet — buscar en el `.map(sefira => ...)` donde se renderiza cada sefirá y agregar:

```tsx
ref={sefira.id === 'tiferet' ? tiferetRef as React.RefObject<any> : undefined}
```

(El `as any` es porque el ref puede ir a un `<g>`, `<circle>`, o `<button>` — el tipo no importa para el tour, solo el bounding rect.)

- [ ] **Step 3: Verificar tsc y build**

```bash
cd frontend
npx tsc -b
npm run build
```
Expected: PASS sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/espejo/components/SefirotInteractiveTree.tsx
git commit -m "feat(onboarding): registrar árbol y Tiferet como targets del tour (pasos 1 y 2)"
```

---

## Task 7: Wire QuestionCard — prop `isFirstVisible` + registrar paso 3

**Files:**
- Modify: `frontend/src/espejo/components/QuestionCard.tsx`

- [ ] **Step 1: Agregar la prop opcional y el ref**

Buscar la definición del tipo de props del componente (`Props` o inline). Agregar:
```tsx
type Props = {
  pregunta: PreguntaConEstado;
  onSaved: () => void;
  isFirstVisible?: boolean;  // ← NUEVO
};
```

En los imports:
```tsx
import { useRef } from 'react';
import { useTourStep } from '../../onboarding';
```

Dentro del componente:
```tsx
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useTourStep(3, isFirstVisible ? (textareaRef as React.RefObject<HTMLElement>) : { current: null });
```

Pasar el `ref={textareaRef}` al `<textarea>` del componente.

**Nota:** el ternario `isFirstVisible ? ref : {current: null}` hace que el hook solo registre cuando es la primera card. Las demás cards llaman al hook con un ref vacío que no registra nada (el `if (!current) return` adentro del registerTarget filtra).

Wait — el `registerTarget` no tiene ese guard. Voy a agregar el guard adentro del hook:

Reemplazar el contenido del `useTourStep.ts` ya creado por:
```typescript
import { useEffect, type RefObject } from 'react';

import { useTourEspejo } from './TourEspejoContext';
import type { StepId } from './tour-espejo-steps';

export function useTourStep(
  stepId: StepId,
  ref: RefObject<HTMLElement> | null,
): void {
  const tour = useTourEspejo();
  useEffect(() => {
    if (!tour.isActive) return;
    if (!ref) return;
    const cleanup = tour.registerTarget(stepId, ref);
    return cleanup;
  }, [tour.isActive, stepId, ref, tour.registerTarget]);
}
```

Y entonces en `QuestionCard.tsx`:
```tsx
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useTourStep(3, isFirstVisible ? (textareaRef as React.RefObject<HTMLElement>) : null);
```

- [ ] **Step 2: Verificar tsc y build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/onboarding/useTourStep.ts frontend/src/espejo/components/QuestionCard.tsx
git commit -m "feat(onboarding): QuestionCard registra textarea como target del paso 3 cuando isFirstVisible"
```

---

## Task 8: SefiraDetailPanel — pasar `isFirstVisible` al primer QuestionCard

**Files:**
- Modify: `frontend/src/espejo/components/SefiraDetailPanel.tsx` (o el componente que mapea las QuestionCards — confirmar en código)

- [ ] **Step 1: Identificar dónde se renderizan los QuestionCard**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space"
grep -rn "QuestionCard" frontend/src/espejo --include="*.tsx"
```

Probablemente el patrón es `preguntas.map((p, i) => <QuestionCard ... />)` en `SefiraDetailPanel.tsx`, `QuestionCarousel.tsx`, o `GuideQuestionsList.tsx`. Localizar el componente.

- [ ] **Step 2: Agregar isFirstVisible al primer card**

En el `.map(...)` agregar la prop:
```tsx
preguntas.map((p, i) => (
  <QuestionCard
    key={p.pregunta_id}
    pregunta={p}
    onSaved={handleSaved}
    isFirstVisible={i === 0}  // ← NUEVO
  />
))
```

- [ ] **Step 3: Verificar tsc y build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/espejo/components/SefiraDetailPanel.tsx
git commit -m "feat(onboarding): marcar el primer QuestionCard como isFirstVisible para el tour"
```

---

## Task 9: Wire ReflectionEditor — registrar paso 4

**Files:**
- Modify: `frontend/src/espejo/components/ReflectionEditor.tsx`

- [ ] **Step 1: Agregar ref y registro**

En los imports:
```tsx
import { useRef } from 'react';
import { useTourStep } from '../../onboarding';
```

Dentro del componente:
```tsx
  const rootRef = useRef<HTMLDivElement>(null);
  useTourStep(4, rootRef as React.RefObject<HTMLElement>);
```

Aplicar `ref={rootRef}` al elemento root del editor (el outermost `<div>` o `<section>` del componente).

- [ ] **Step 2: Verificar tsc y build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/espejo/components/ReflectionEditor.tsx
git commit -m "feat(onboarding): registrar ReflectionEditor como target del paso 4"
```

---

## Task 10: Wire HistoryList — registrar paso 5

**Files:**
- Modify: `frontend/src/espejo/components/HistoryList.tsx`

- [ ] **Step 1: Agregar ref y registro**

En los imports:
```tsx
import { useRef } from 'react';
import { useTourStep } from '../../onboarding';
```

Dentro del componente, después de la línea actual `const [open, setOpen] = useState(false);`:
```tsx
  const rootRef = useRef<HTMLDivElement>(null);
  useTourStep(5, rootRef as React.RefObject<HTMLElement>);
```

Aplicar `ref={rootRef}` al `<div>` outermost del HistoryList.

- [ ] **Step 2: Verificar tsc y build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/espejo/components/HistoryList.tsx
git commit -m "feat(onboarding): registrar HistoryList como target del paso 5"
```

---

## Task 11: Wire EspejoModule — disparar tour post-EspejoIntro + cleanup

**Files:**
- Modify: `frontend/src/espejo/EspejoModule.tsx`

- [ ] **Step 1: Leer el archivo para encontrar handleIntroComplete y los effects**

```bash
head -60 "c:/Users/123/Desktop/Kabbalah Space/frontend/src/espejo/EspejoModule.tsx"
```

Identificar:
- Dónde está `onIntroComplete` o el callback equivalente que dispara cuando la intro cinemática termina
- El cleanup del componente (return de un useEffect raíz, si existe)

- [ ] **Step 2: Importar y agregar lógica**

En los imports:
```tsx
import { useEffect } from 'react';
import { useTourEspejo } from '../onboarding';
import { TOUR_DONE_FLAG } from '../onboarding/tour-espejo-steps';
```

(Si `useEffect` ya está importado, no duplicar el import.)

Dentro del componente:
```tsx
  const tour = useTourEspejo();
```

Modificar la función `handleIntroComplete` (o equivalente — usualmente está en `App.tsx`; verificar dónde). Si está en `App.tsx` y se pasa como prop, mejor mover la lógica del tour ahí. Si está en `EspejoModule`, agregar al final:

```tsx
  const wasHandleIntroComplete = handleIntroComplete; // si ya hay una definida
  function handleIntroComplete() {
    wasHandleIntroComplete?.();
    try {
      if (localStorage.getItem(TOUR_DONE_FLAG) !== '1') {
        tour.start();
      }
    } catch {
      /* localStorage unavailable */
    }
  }
```

**IMPORTANTE:** revisar el código existente. Si el callback ya recibe lógica, integrarla con cuidado — no romper el flag de `INTRO_FLAG` que ya se setea ahí.

- [ ] **Step 3: Agregar cleanup que cancela el tour si el usuario sale del módulo**

Agregar un useEffect:
```tsx
  useEffect(() => {
    return () => {
      if (tour.isActive) {
        tour.skip();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

(Disabling exhaustive-deps porque `tour` cambia en cada render — solo queremos correr el cleanup al unmount real del módulo.)

- [ ] **Step 4: Exportar TOUR_DONE_FLAG en el barrel**

Editar `frontend/src/onboarding/index.ts` y agregar:
```typescript
export { TOUR_DONE_FLAG } from './tour-espejo-steps';
```

- [ ] **Step 5: Verificar tsc y build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/onboarding/index.ts frontend/src/espejo/EspejoModule.tsx
git commit -m "feat(onboarding): disparar tour del Espejo post-intro si no fue completado"
```

---

## Task 12: Wire App.tsx — Provider + TourTooltip + setActiveView guard

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Importar Provider + Tooltip + hook**

En los imports al inicio:
```tsx
import { TourEspejoProvider, TourTooltip, useTourEspejo } from './onboarding';
```

- [ ] **Step 2: Envolver con el Provider**

El App component actual termina con:
```tsx
export default function App() {
  return (
    <PremiumGateProvider>
      <AppInner />
    </PremiumGateProvider>
  );
}
```

Reemplazar por:
```tsx
export default function App() {
  return (
    <PremiumGateProvider>
      <TourEspejoProvider>
        <AppInner />
      </TourEspejoProvider>
    </PremiumGateProvider>
  );
}
```

- [ ] **Step 3: Interceptar setActiveView**

Dentro de `AppInner`, después del `const gate = useGate();`:
```tsx
  const tour = useTourEspejo();
```

Encontrar la línea `const [activeView, setActiveView] = useState<ViewKey>('inicio');` y reemplazar por:
```tsx
  const [activeView, setActiveViewRaw] = useState<ViewKey>('inicio');

  const setActiveView = useCallback(
    (target: ViewKey) => {
      if (tour.isActive && target !== 'espejo' && target !== 'inicio') {
        return; // navegación bloqueada durante el tour
      }
      setActiveViewRaw(target);
    },
    [tour.isActive],
  );
```

(Si `useCallback` no está importado, agregarlo: `import { useCallback, useEffect, useState } from 'react';`.)

- [ ] **Step 4: Renderizar TourTooltip a nivel root**

Al final del JSX de `AppInner`, junto a `<PremiumGate />` y `<PremiumPlansModal />`:
```tsx
    <PremiumGate onNavigateToPremium={gate.openPlans} />
    <PremiumPlansModal />
    <TourTooltip />
    </>
  );
}
```

- [ ] **Step 5: Verificar tsc y build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(onboarding): TourEspejoProvider + TourTooltip + interceptación de setActiveView en App"
```

---

## Task 13: Wire InicioNav — tabs disabled durante el tour

**Files:**
- Modify: `frontend/src/inicio/components/InicioNav.tsx`

- [ ] **Step 1: Importar el hook**

En los imports:
```tsx
import { useTourEspejo } from '../../onboarding';
```

- [ ] **Step 2: Leer estado del tour y aplicar disabled visual**

Dentro del componente InicioNav:
```tsx
  const tour = useTourEspejo();
```

Buscar el bloque donde se renderizan los tabs (en el `.map(s => ...)` del array `SECTIONS`). El tab actual probablemente tiene un patrón tipo:

```tsx
{SECTIONS.map((s) => (
  <button key={s.key} onClick={() => onNavigate(s.key)} className="...">
    {s.label}
  </button>
))}
```

Modificarlo para:
```tsx
{SECTIONS.map((s) => {
  const isBlockedByTour = tour.isActive && s.key !== 'espejo';
  return (
    <button
      key={s.key}
      type="button"
      onClick={() => onNavigate(s.key)}
      disabled={isBlockedByTour}
      aria-disabled={isBlockedByTour ? 'true' : undefined}
      title={isBlockedByTour ? 'Terminá el tour antes de salir' : undefined}
      className={`... ${isBlockedByTour ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
    >
      {s.label}
    </button>
  );
})}
```

(Mantener el className original como base — el snippet `...` lo representa.)

- [ ] **Step 3: Verificar tsc y build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/InicioNav.tsx
git commit -m "feat(onboarding): tabs no-Espejo en InicioNav quedan disabled durante el tour"
```

---

## Task 14: QA final — build verde + smoke test manual

**Files:** ninguno modificado (solo verificación)

- [ ] **Step 1: Build limpio**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npm run build
```

Expected: PASS. Notar el tamaño del bundle final — debería estar dentro de ~572 KB (los 569 actuales + ~3 KB máximo del módulo `onboarding/`). Si supera mucho más, revisar.

- [ ] **Step 2: Arrancar dev server y backend**

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

- [ ] **Step 3: Correr el smoke test manual (checklist de 16 puntos)**

Abrir el browser, devtools abiertos en `Application > Local Storage`:

```
[ ] 1. localStorage.clear() en devtools
[ ] 2. Recargar y registrar nuevo usuario (o usar usuario existente sin el flag)
[ ] 3. Click "Mi Árbol de la Vida" → EspejoIntro corre 3-4s
[ ] 4. Tour arranca → tooltip #1 aparece sobre el árbol con flecha → "Siguiente"
[ ] 5. Tooltip #2 apunta a Tiferet → click en Tiferet → carrusel/SefiraDetailPanel abre + tour avanza a paso 3
[ ] 6. Tooltip #3 sobre primer textarea de pregunta guía → focus al textarea → auto-dismiss + avanza a paso 4
[ ] 7. Tooltip #4 sobre ReflectionEditor del sidebar → click en el editor → auto-dismiss + avanza a paso 5
[ ] 8. Escribir reflexión + guardar → HistoryList aparece con la entrada nueva → tooltip #5 sobre el historial
[ ] 9. Click en el historial → tour cierra → localStorage tiene tour_espejo_done='1'
[ ] 10. Recargar página → entrar a /espejo → tour NO aparece (flag respetado)
[ ] 11. localStorage.clear() + entrar al Espejo + apretar "Saltar tour" en paso 1 → tour cierra + flag se setea
[ ] 12. Recargar → tour NO vuelve (skip cuenta como done)
[ ] 13. Durante el tour: verificar que tabs Calendario y Evolución están opacos + cursor-not-allowed + click no hace nada
[ ] 14. Durante el tour: apretar Saltar → nav se desbloquea inmediatamente
[ ] 15. Resize devtools a 375px (mobile) durante el tour → tooltips fallbackean a placement bottom sin overflow
[ ] 16. Caso edge: abrir devtools settings > Rendering > prefers-reduced-motion: ON → animaciones se hacen instantáneas
```

Si alguno falla, NO completar este task. Crear sub-task con el fix necesario, ejecutarlo, y volver al checklist.

- [ ] **Step 4: Commit final del checklist completado (opcional)**

Si todo pasó:
```bash
git log --oneline -15
# verificar que están los 13 commits del onboarding más este task
```

No hay commit en este task — es solo verificación.

- [ ] **Step 5: Push del branch**

```bash
git push origin feat/gcal-sync
```

(O el branch en que estamos trabajando — confirmar primero con `git branch --show-current`.)

---

## Self-Review

### Spec coverage
- ✓ Sección 1 (Objetivo): cubierto implícito por todo el plan
- ✓ Sección 2 (Decisiones): cada decisión mapea a una task (alcance → solo Espejo, trigger → task 11, formato → task 4, dinámica → tasks 1+4, persistencia → task 2, stack → todo el plan, bloqueo nav → tasks 12+13)
- ✓ Sección 3.1 (layout archivos): tasks 1-5 + 6-10 cubren todo
- ✓ Sección 3.2 (componentes modificados): tasks 6-13 cubren los 7 archivos listados
- ✓ Sección 3.3 (Context API): task 2
- ✓ Sección 3.4 (steps config): task 1
- ✓ Sección 3.5 (tooltip): tasks 4 + 5
- ✓ Sección 3.6 (useTourStep): task 3 (+ ajuste en task 7 para el guard de null)
- ✓ Sección 3.7 (bloqueo navegación): tasks 12 + 13
- ✓ Sección 4 (data flow): cubierto por la secuencia de tasks
- ✓ Sección 5 (edge cases): task 5 pausa por modales, task 4 timer del paso 5, task 11 cleanup en unmount, task 4 mobile/reduced-motion
- ✓ Sección 6 (testing): task 14

### Type consistency
- `StepId` definido en task 1, usado consistentemente en 2, 3, 4
- `TOUR_DONE_FLAG` exportado en task 1, re-exportado en barrel en task 11
- `RefObject<HTMLElement>` consistente en useTourStep y consumidores
- Nombres de funciones del context (`start`, `next`, `skip`, `registerTarget`, `getTargetRef`) consistentes a lo largo del plan

### Placeholder scan
- Ningún "TBD" / "TODO" en steps
- Snippets `...` en task 13 representan el className existente del componente — necesario porque no leí ese código en el plan. La instrucción "mantener el className original como base" es clara
- En task 8 hay un "confirmar en código" — eso es legítimo investigación previa a editar (el plan no puede asumir qué componente itera sin chequear). El step incluye el comando grep para localizarlo

Plan listo.
