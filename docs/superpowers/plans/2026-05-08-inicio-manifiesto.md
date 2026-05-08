# Página de Bienvenida (Manifiesto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a long-scroll welcome / manifiesto page (`InicioModule`) that becomes the default view, framing Kabbalah Space's central idea (self-knowledge as the foundation for knowledge of the universe) before the user lands on the Tree.

**Architecture:** New `frontend/src/inicio/` module with one container (`InicioModule`), one shared section wrapper (`InicioSection`) that handles `useInView`-driven fade-ins, and six section components — one per narrative beat. `App.tsx` adds `'inicio'` to the `ViewKey` union, makes it the default view, hides its generic header when active (the manifiesto has its own typography), and wires a callback so the final CTA can switch back to the Espejo.

**Tech Stack:** React 19 + TypeScript, framer-motion 11 (`motion`, `useInView`, `useReducedMotion`, `AnimatePresence`), Tailwind 4. No new deps.

**Branch & merge:** `feat/inicio-manifiesto` (already created). Squash-merge to `main`.

**Test strategy:** No automated tests — frontend has no vitest setup. Verification via `tsc -b --noEmit`, `vite build`, and a manual checklist at the end.

---

## Pre-Task: Confirm starting state

- [ ] **Step 1: Verify branch and base**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space"
git status
git log --oneline -3
```

Expected: on `feat/inicio-manifiesto`, top commit is the design spec for this feature, base is `main` with M6 closed.

- [ ] **Step 2: Build smoke**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npm run build
```

Expected: vite build succeeds (~477 KB / ~143 KB gzip). If it fails, stop.

---

## Task 1: App.tsx routing + skeleton `InicioModule`

Add the `'inicio'` view to the `ViewKey` type, update `NAV_ITEMS` (rail icon) and `VIEW_TITLES`, change the default `activeView` to `'inicio'`, hide the generic header when on inicio, and create a minimal placeholder `InicioModule` so the build stays green.

**Files:**
- Create: `frontend/src/inicio/InicioModule.tsx`
- Create: `frontend/src/inicio/index.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create the placeholder `InicioModule.tsx`**

```tsx
import { motion } from 'framer-motion';

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Welcome / manifiesto landing. Long-scroll page broken into six section
 * components rendered by this container. The final CTA fires
 * `onEnterEspejo`, which the App-level handler turns into a
 * `setActiveView('espejo')`.
 */
export default function InicioModule({ onEnterEspejo }: Props) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto px-6 md:px-8"
    >
      <div className="py-32 text-center text-stone-400 italic">
        Manifiesto en construcción.{' '}
        <button
          type="button"
          onClick={onEnterEspejo}
          className="underline text-amber-200 hover:text-amber-100 transition-colors"
        >
          Entrar al Árbol de la Vida
        </button>
      </div>
    </motion.main>
  );
}
```

- [ ] **Step 2: Create the barrel export**

`frontend/src/inicio/index.ts`:

```ts
export { default } from './InicioModule';
```

- [ ] **Step 3: Update `frontend/src/App.tsx`**

Edit 3a — extend the `ViewKey` union. Find:

```ts
type ViewKey = 'espejo' | 'admin' | 'calendario' | 'evolucion';
```

Replace with:

```ts
type ViewKey = 'inicio' | 'espejo' | 'admin' | 'calendario' | 'evolucion';
```

Edit 3b — add `'inicio'` entry to `VIEW_TITLES`. Find:

```ts
const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  espejo:     { title: 'Mi Árbol de la Vida',    subtitle: 'Reflexión guiada por las dimensiones del alma.' },
  evolucion:  { title: 'Mi Evolución',            subtitle: 'El movimiento mensual de cada dimensión del alma.' },
  calendario: { title: 'Calendario Cabalístico', subtitle: 'La organización es parte del camino de rectificación. Organiza tu semana y tus dimensiones.' },
  admin:      { title: 'Panel de Administrador', subtitle: 'Gestión de preguntas guía por sefirá.' },
};
```

Replace with:

```ts
const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  inicio:     { title: 'Kabbalah Space',          subtitle: 'El conocimiento del universo empieza por adentro.' },
  espejo:     { title: 'Mi Árbol de la Vida',    subtitle: 'Reflexión guiada por las dimensiones del alma.' },
  evolucion:  { title: 'Mi Evolución',            subtitle: 'El movimiento mensual de cada dimensión del alma.' },
  calendario: { title: 'Calendario Cabalístico', subtitle: 'La organización es parte del camino de rectificación. Organiza tu semana y tus dimensiones.' },
  admin:      { title: 'Panel de Administrador', subtitle: 'Gestión de preguntas guía por sefirá.' },
};
```

(The `inicio` title/subtitle never actually render — the manifiesto hides the header — but the type system requires the entry.)

Edit 3c — prepend `'inicio'` to `NAV_ITEMS`. Find:

```ts
const NAV_ITEMS = [
  { key: 'espejo' as ViewKey,     icon: 'account_tree',           label: 'Mi Árbol de la Vida' },
  { key: 'evolucion' as ViewKey,  icon: 'monitoring',              label: 'Mi Evolución' },
  { key: 'calendario' as ViewKey, icon: 'event_note',              label: 'Calendario Cabalístico' },
  { key: 'admin' as ViewKey,      icon: 'admin_panel_settings',    label: 'Panel de Administrador' },
];
```

Replace with:

```ts
const NAV_ITEMS = [
  { key: 'inicio' as ViewKey,     icon: 'auto_stories',            label: 'Bienvenida' },
  { key: 'espejo' as ViewKey,     icon: 'account_tree',           label: 'Mi Árbol de la Vida' },
  { key: 'evolucion' as ViewKey,  icon: 'monitoring',              label: 'Mi Evolución' },
  { key: 'calendario' as ViewKey, icon: 'event_note',              label: 'Calendario Cabalístico' },
  { key: 'admin' as ViewKey,      icon: 'admin_panel_settings',    label: 'Panel de Administrador' },
];
```

Edit 3d — change default `activeView`. Find:

```ts
  const [activeView, setActiveView] = useState<ViewKey>('espejo');
```

Replace with:

```ts
  const [activeView, setActiveView] = useState<ViewKey>('inicio');
```

Edit 3e — import the new module. Find the existing module imports near the top:

```ts
import EspejoModule from "./espejo";
import EvolucionModule from "./evolucion";
```

Add right after them:

```ts
import InicioModule from "./inicio";
```

Edit 3f — wrap the generic `<header>` so it doesn't render on inicio. Find:

```tsx
        <header className="w-full max-w-[1400px] 2xl:max-w-[1600px] mb-8 px-4 py-6 text-center overflow-hidden">
```

Replace the entire `<header>...</header>` block with a conditional. The current block ends around line 174 (just before the `<section>`). Find this whole block:

```tsx
        <header className="w-full max-w-[1400px] 2xl:max-w-[1600px] mb-8 px-4 py-6 text-center overflow-hidden">
          <motion.h2
            initial={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -80 }}
            animate={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -80 }}
            transition={{ duration: 0.85, delay: pageRevealed ? 0.45 : 0, ease }}
            style={{ willChange: 'transform, opacity' }}
            className={`font-serif text-4xl md:text-5xl font-light tracking-tight mb-4 ${glowText}`}
          >
            {current.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -60 }}
            animate={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -60 }}
            transition={{ duration: 0.85, delay: pageRevealed ? 0.6 : 0, ease }}
            style={{ willChange: 'transform, opacity' }}
            className="text-stone-400 text-sm md:text-base font-light tracking-wide max-w-2xl mx-auto leading-relaxed"
          >
            {current.subtitle}
          </motion.p>
        </header>
```

Replace with:

```tsx
        {activeView !== 'inicio' && (
          <header className="w-full max-w-[1400px] 2xl:max-w-[1600px] mb-8 px-4 py-6 text-center overflow-hidden">
            <motion.h2
              initial={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -80 }}
              animate={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -80 }}
              transition={{ duration: 0.85, delay: pageRevealed ? 0.45 : 0, ease }}
              style={{ willChange: 'transform, opacity' }}
              className={`font-serif text-4xl md:text-5xl font-light tracking-tight mb-4 ${glowText}`}
            >
              {current.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -60 }}
              animate={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -60 }}
              transition={{ duration: 0.85, delay: pageRevealed ? 0.6 : 0, ease }}
              style={{ willChange: 'transform, opacity' }}
              className="text-stone-400 text-sm md:text-base font-light tracking-wide max-w-2xl mx-auto leading-relaxed"
            >
              {current.subtitle}
            </motion.p>
          </header>
        )}
```

Edit 3g — render `InicioModule` inside the `<section>` switch. Find:

```tsx
        <section className="w-full max-w-[1400px] 2xl:max-w-[1600px] px-2 relative" key={activeView}>
          {activeView === 'admin' && <AdminPanel sefirot={SEFIROT} glowText={glowText} />}
          {activeView === 'calendario' && <CalendarModule sefirot={SEFIROT as any} glowText={glowText} />}
          {activeView === 'evolucion' && <EvolucionModule />}
          {activeView === 'espejo' && (
```

Add an `inicio` branch immediately before the existing branches:

```tsx
        <section className="w-full max-w-[1400px] 2xl:max-w-[1600px] px-2 relative" key={activeView}>
          {activeView === 'inicio' && <InicioModule onEnterEspejo={() => setActiveView('espejo')} />}
          {activeView === 'admin' && <AdminPanel sefirot={SEFIROT} glowText={glowText} />}
          {activeView === 'calendario' && <CalendarModule sefirot={SEFIROT as any} glowText={glowText} />}
          {activeView === 'evolucion' && <EvolucionModule />}
          {activeView === 'espejo' && (
```

- [ ] **Step 4: Type-check**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
```

Expected: clean.

- [ ] **Step 5: Build smoke**

```bash
npm run build
```

Expected: success.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/inicio/InicioModule.tsx frontend/src/inicio/index.ts frontend/src/App.tsx
git commit -m "feat(inicio): scaffold welcome view + nav rail entry + default route"
```

---

## Task 2: `InicioSection` wrapper

Common wrapper used by all six section components. Encapsulates the `useInView`-driven fade-up animation and the section padding.

**Files:**
- Create: `frontend/src/inicio/components/InicioSection.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

type Props = {
  children: React.ReactNode;
  /** Override vertical padding for sections that need extra room (the
   *  full-screen hook wants more breathing space than the body sections). */
  className?: string;
};

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Wrapper for every manifiesto section. The shared concerns:
 *  - vertical padding generous enough to give the text air;
 *  - a one-shot fade-up triggered by `useInView` when the section is
 *    mostly within the viewport;
 *  - `prefers-reduced-motion` collapses the animation to a plain fade,
 *    leaving any per-section motion (orbs, line draws) to the children
 *    to disable themselves the same way.
 */
export default function InicioSection({ children, className = '' }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: reduced ? 0 : 24 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 24 }}
      transition={{ duration: 0.85, ease }}
      className={`py-24 md:py-32 ${className}`}
    >
      {children}
    </motion.section>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: clean. The component is self-contained.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/inicio/components/InicioSection.tsx
git commit -m "feat(inicio): InicioSection wrapper with useInView fade-up"
```

---

## Task 3: Section 1 — Hook (pulsing orb)

The opening: two-line poetic statement above a softly pulsing orb.

**Files:**
- Create: `frontend/src/inicio/components/Section1Hook.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Create `Section1Hook.tsx`**

```tsx
import { motion, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';

const ORB_COLOR = '#e9c349';

/**
 * Section 1 — Hook. A two-line statement and a softly pulsing orb.
 * The orb reuses the radial-gradient + glow pattern from the Tree of Life
 * orbs so the visual language is continuous with what comes later.
 */
export default function Section1Hook() {
  const reduced = useReducedMotion();
  return (
    <InicioSection className="min-h-[80vh] flex flex-col items-center justify-center text-center">
      <h1 className="font-serif font-light tracking-tight text-amber-100/90 text-5xl md:text-7xl leading-tight mb-12">
        El viaje hacia el universo
        <br />
        empieza adentro.
      </h1>
      <motion.div
        animate={reduced ? { opacity: 1 } : { scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' }}
        className="w-16 h-16 rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${ORB_COLOR}ff 0%, ${ORB_COLOR}aa 60%, ${ORB_COLOR}55 100%)`,
          border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: `inset -8px -8px 16px rgba(0,0,0,0.6), inset 8px 8px 16px rgba(255,255,255,0.3), 0 0 24px ${ORB_COLOR}aa, 0 0 48px ${ORB_COLOR}55`,
        }}
        aria-hidden
      />
    </InicioSection>
  );
}
```

- [ ] **Step 2: Plug it into `InicioModule.tsx`**

Replace the entire `frontend/src/inicio/InicioModule.tsx` body with:

```tsx
import { motion } from 'framer-motion';
import Section1Hook from './components/Section1Hook';

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Welcome / manifiesto landing. Long-scroll page broken into six section
 * components rendered by this container. The final CTA fires
 * `onEnterEspejo`, which the App-level handler turns into a
 * `setActiveView('espejo')`.
 */
export default function InicioModule({ onEnterEspejo }: Props) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto px-6 md:px-8"
    >
      <Section1Hook />
      {/* Sections 2–5 land here as later tasks add them. */}
      <div className="py-24 text-center text-stone-400 italic">
        <button
          type="button"
          onClick={onEnterEspejo}
          className="underline text-amber-200 hover:text-amber-100 transition-colors"
        >
          Entrar al Árbol de la Vida
        </button>
      </div>
    </motion.main>
  );
}
```

(`onEnterEspejo` is still consumed by the placeholder bottom button until Task 8 swaps it for the real CTA.)

- [ ] **Step 3: Build smoke**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run build
```

Expected: clean + success.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/Section1Hook.tsx frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): Section 1 — hook + pulsing orb"
```

---

## Task 4: Section 2 — La promesa (general)

Tu voz + cita verbatim de Isaías 11.9. Decoración: una línea horizontal dorada que se "dibuja" left→right cuando entra el viewport.

**Files:**
- Create: `frontend/src/inicio/components/Section2Promise.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Create `Section2Promise.tsx`**

```tsx
import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Section 2 — La promesa. Carries the "general" beat: the eventual
 * collective awakening of humanity. Anchored by an Isaiah verse rendered
 * verbatim. The decorative line draws left→right when the section enters
 * the viewport.
 */
export default function Section2Promise() {
  const lineRef = useRef<SVGSVGElement | null>(null);
  const lineInView = useInView(lineRef, { once: true, margin: '0px 0px -20% 0px' });
  const reduced = useReducedMotion();

  return (
    <InicioSection className="text-center">
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-8">
        Llegará un día en que la humanidad entera
        <br />
        conocerá el misterio en el que vive.
      </p>

      <svg
        ref={lineRef}
        viewBox="0 0 200 2"
        className="block mx-auto w-32 md:w-40 h-[2px] mb-8"
        aria-hidden
      >
        <motion.line
          x1={0}
          y1={1}
          x2={200}
          y2={1}
          stroke="rgba(253,230,138,0.6)"
          strokeWidth={2}
          strokeLinecap="round"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: lineInView ? 1 : reduced ? 1 : 0 }}
          transition={{ duration: 1.2, ease }}
        />
      </svg>

      <blockquote className="font-serif italic text-base text-stone-400 leading-relaxed">
        "Porque la tierra será llena del conocimiento del Señor,
        <br />
        como las aguas cubren el mar."
        <footer className="mt-2 not-italic text-[11px] uppercase tracking-[0.18em] text-stone-500">
          Isaías 11.9
        </footer>
      </blockquote>
    </InicioSection>
  );
}
```

- [ ] **Step 2: Add `Section2Promise` import + render in `InicioModule.tsx`**

Find:

```tsx
import Section1Hook from './components/Section1Hook';
```

Add right after:

```tsx
import Section2Promise from './components/Section2Promise';
```

Find:

```tsx
      <Section1Hook />
      {/* Sections 2–5 land here as later tasks add them. */}
```

Replace with:

```tsx
      <Section1Hook />
      <Section2Promise />
      {/* Sections 3–5 land here as later tasks add them. */}
```

- [ ] **Step 3: Build smoke**

```bash
npx tsc -b --noEmit
npm run build
```

Expected: clean + success.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/Section2Promise.tsx frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): Section 2 — la promesa + horizontal line draw"
```

---

## Task 5: Section 3 — El camino (particular)

Tu voz + cita verbatim de los sabios. Decoración: tres puntos de luz que aparecen escalonados y se conectan con dos líneas finas (mini-constelación).

**Files:**
- Create: `frontend/src/inicio/components/Section3Path.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Create `Section3Path.tsx`**

```tsx
import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';

const ease = [0.16, 1, 0.3, 1] as const;
const DOT_R = 4;
const DOTS: { cx: number; cy: number }[] = [
  { cx: 30, cy: 28 },
  { cx: 100, cy: 12 },
  { cx: 170, cy: 28 },
];

/**
 * Section 3 — El camino. Carries the "particular" beat: in every
 * generation, a few individuals already live the knowledge as eyesight,
 * not rumor. Anchored by the rabbinical line about Abraham and Jacob.
 *
 * The constellation: three dots fade in staggered, then two connecting
 * lines draw between them.
 */
export default function Section3Path() {
  const ref = useRef<SVGSVGElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -20% 0px' });
  const reduced = useReducedMotion();

  return (
    <InicioSection className="text-center">
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-2">
        Pero ese día no nace de la multitud.
      </p>
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-8">
        Cada generación lleva sus despiertos —
        <br />
        pocos, suficientes — que ya viven
        <br />
        el conocimiento como ojo, no como rumor.
      </p>

      <svg
        ref={ref}
        viewBox="0 0 200 40"
        className="block mx-auto w-40 md:w-52 mb-8"
        aria-hidden
      >
        {/* Connecting lines drawn after the dots appear. */}
        <motion.line
          x1={DOTS[0].cx} y1={DOTS[0].cy}
          x2={DOTS[1].cx} y2={DOTS[1].cy}
          stroke="rgba(253,230,138,0.45)" strokeWidth={1} strokeLinecap="round"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: inView ? 1 : reduced ? 1 : 0 }}
          transition={{ duration: 0.9, ease, delay: reduced ? 0 : 0.9 }}
        />
        <motion.line
          x1={DOTS[1].cx} y1={DOTS[1].cy}
          x2={DOTS[2].cx} y2={DOTS[2].cy}
          stroke="rgba(253,230,138,0.45)" strokeWidth={1} strokeLinecap="round"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: inView ? 1 : reduced ? 1 : 0 }}
          transition={{ duration: 0.9, ease, delay: reduced ? 0 : 1.3 }}
        />
        {/* Three luminous dots. */}
        {DOTS.map((d, i) => (
          <motion.circle
            key={i}
            cx={d.cx} cy={d.cy} r={DOT_R}
            fill="rgba(253,230,138,0.95)"
            initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.4 }}
            animate={{
              opacity: inView ? 1 : reduced ? 1 : 0,
              scale: inView ? 1 : reduced ? 1 : 0.4,
            }}
            transition={{ duration: 0.5, ease, delay: reduced ? 0 : i * 0.3 }}
            style={{ filter: `drop-shadow(0 0 4px rgba(253,230,138,0.8))` }}
          />
        ))}
      </svg>

      <blockquote className="font-serif italic text-base text-stone-400 leading-relaxed">
        "No hay generación en la cual
        <br />
        no haya alguien como Abraham y Jacob."
        <footer className="mt-2 not-italic text-[11px] uppercase tracking-[0.18em] text-stone-500">
          Sabios de la tradición
        </footer>
      </blockquote>
    </InicioSection>
  );
}
```

- [ ] **Step 2: Plug into `InicioModule.tsx`**

Add the import after `Section2Promise`:

```tsx
import Section3Path from './components/Section3Path';
```

Find:

```tsx
      <Section1Hook />
      <Section2Promise />
      {/* Sections 3–5 land here as later tasks add them. */}
```

Replace with:

```tsx
      <Section1Hook />
      <Section2Promise />
      <Section3Path />
      {/* Sections 4–5 land here as later tasks add them. */}
```

- [ ] **Step 3: Build smoke**

```bash
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/Section3Path.tsx frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): Section 3 — el camino + 3-dot constellation"
```

---

## Task 6: Section 4 — El puente (expanding orb)

Statement that bridges general → particular: knowing the universe is knowing yourself. Decoración: un orbe central que crece (`scale 0.4 → 1.2`) mientras entra al viewport.

**Files:**
- Create: `frontend/src/inicio/components/Section4Bridge.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Create `Section4Bridge.tsx`**

```tsx
import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';

const ORB_COLOR = '#e9c349';
const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Section 4 — El puente. The thesis statement of the manifiesto:
 * knowledge of the universe begins with self-knowledge. Decorative
 * orb expands (scale 0.4 → 1.2) when the section enters the viewport
 * to suggest "opening".
 */
export default function Section4Bridge() {
  const orbRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(orbRef, { once: true, margin: '0px 0px -20% 0px' });
  const reduced = useReducedMotion();

  return (
    <InicioSection className="text-center">
      <h2 className="font-serif font-light tracking-tight text-amber-100/90 text-3xl md:text-5xl leading-tight mb-10">
        Conocer el universo empieza
        <br />
        por conocerte a vos mismo.
      </h2>
      <p className="font-serif italic text-lg md:text-xl text-stone-300/85 leading-relaxed mb-12">
        Cada dimensión del alma
        <br />
        es un pliegue del cosmos.
      </p>

      <motion.div
        ref={orbRef}
        initial={{ scale: reduced ? 1 : 0.4, opacity: reduced ? 1 : 0 }}
        animate={inView ? { scale: 1.2, opacity: 1 } : { scale: reduced ? 1 : 0.4, opacity: reduced ? 1 : 0 }}
        transition={{ duration: 1.5, ease }}
        className="w-20 h-20 mx-auto rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${ORB_COLOR}ff 0%, ${ORB_COLOR}aa 60%, ${ORB_COLOR}55 100%)`,
          border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: `inset -8px -8px 16px rgba(0,0,0,0.6), inset 8px 8px 16px rgba(255,255,255,0.3), 0 0 32px ${ORB_COLOR}aa, 0 0 64px ${ORB_COLOR}55`,
        }}
        aria-hidden
      />
    </InicioSection>
  );
}
```

- [ ] **Step 2: Plug into `InicioModule.tsx`**

Add import after Section 3:

```tsx
import Section4Bridge from './components/Section4Bridge';
```

Find:

```tsx
      <Section1Hook />
      <Section2Promise />
      <Section3Path />
      {/* Sections 4–5 land here as later tasks add them. */}
```

Replace with:

```tsx
      <Section1Hook />
      <Section2Promise />
      <Section3Path />
      <Section4Bridge />
      {/* Section 5 lands here in the next task. */}
```

- [ ] **Step 3: Build smoke**

```bash
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/Section4Bridge.tsx frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): Section 4 — el puente + expanding orb"
```

---

## Task 7: Section 5 — La herramienta (tree silhouette)

Describe what Kabbalah Space does. Decoración: silueta del Árbol de la Vida — los 10 sefirot como círculos vacíos y las 22 conexiones como líneas que se "dibujan" cuando entra el viewport. Sin colores, solo trazos finos amarillo claro.

**Files:**
- Create: `frontend/src/inicio/components/Section5Tool.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Create `Section5Tool.tsx`**

The component reuses the `CONNECTIONS` constant from `frontend/src/shared/tokens.ts` for the line topology, and a local copy of the sefirá positions (the same coords used by `App.tsx` SEFIROT array, simplified to id+name+x+y).

```tsx
import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';
import { CONNECTIONS } from '../../shared/tokens';

const ease = [0.16, 1, 0.3, 1] as const;

const TREE_NODES: { id: string; cx: number; cy: number }[] = [
  { id: 'keter',   cx: 200, cy: 80 },
  { id: 'jojma',   cx: 320, cy: 180 },
  { id: 'bina',    cx: 80,  cy: 180 },
  { id: 'jesed',   cx: 320, cy: 310 },
  { id: 'gevura',  cx: 80,  cy: 310 },
  { id: 'tiferet', cx: 200, cy: 410 },
  { id: 'netzaj',  cx: 320, cy: 530 },
  { id: 'hod',     cx: 80,  cy: 530 },
  { id: 'yesod',   cx: 200, cy: 630 },
  { id: 'maljut',  cx: 200, cy: 750 },
];
const NODE_R = 14;
const STROKE = 'rgba(253,230,138,0.35)';

/**
 * Section 5 — La herramienta. Describes what Kabbalah Space *does*. The
 * decorative SVG is a stripped-down Tree of Life silhouette — empty
 * circles and the 22 connections — drawn with `pathLength` when the
 * section enters the viewport. No colour fills; the contrast against
 * the real, vivid Tree later is the point.
 */
export default function Section5Tool() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const inView = useInView(svgRef, { once: true, margin: '0px 0px -10% 0px' });
  const reduced = useReducedMotion();

  return (
    <InicioSection className="text-center">
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-4">
        Kabbalah Space mapea diez dimensiones del alma
      </p>
      <p className="font-serif italic text-base md:text-lg text-stone-400 leading-relaxed mb-4">
        — las sefirot del Árbol de la Vida —
      </p>
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-2">
        para que observes cómo se mueve cada una
        <br />
        en tu vida diaria.
      </p>
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-12">
        Reflexionás, registrás actividades,
        <br />
        y el árbol te devuelve lo que está vibrando
        <br />
        y lo que está callado.
      </p>

      <svg
        ref={svgRef}
        viewBox="0 0 400 830"
        className="block mx-auto w-full max-w-xs md:max-w-sm"
        aria-hidden
      >
        {/* Connections drawn first so the nodes render on top. */}
        {CONNECTIONS.map((c, i) => {
          const a = TREE_NODES.find((n) => n.id === c.n1);
          const b = TREE_NODES.find((n) => n.id === c.n2);
          if (!a || !b) return null;
          return (
            <motion.line
              key={`${c.n1}-${c.n2}`}
              x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
              stroke={STROKE} strokeWidth={1.2} strokeLinecap="round"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: inView ? 1 : reduced ? 1 : 0 }}
              transition={{ duration: 0.6, ease, delay: reduced ? 0 : i * 0.05 }}
            />
          );
        })}
        {/* Empty circles for each sefirá — fade in after lines start. */}
        {TREE_NODES.map((n, i) => (
          <motion.circle
            key={n.id}
            cx={n.cx} cy={n.cy} r={NODE_R}
            fill="rgba(253,230,138,0.05)"
            stroke={STROKE} strokeWidth={1.2}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: inView ? 1 : reduced ? 1 : 0 }}
            transition={{ duration: 0.4, ease, delay: reduced ? 0 : 1.3 + i * 0.08 }}
          />
        ))}
      </svg>
    </InicioSection>
  );
}
```

- [ ] **Step 2: Plug into `InicioModule.tsx`**

Add import:

```tsx
import Section5Tool from './components/Section5Tool';
```

Replace:

```tsx
      <Section1Hook />
      <Section2Promise />
      <Section3Path />
      <Section4Bridge />
      {/* Section 5 lands here in the next task. */}
```

with:

```tsx
      <Section1Hook />
      <Section2Promise />
      <Section3Path />
      <Section4Bridge />
      <Section5Tool />
      {/* Section 6 (CTA) lands here in the next task. */}
```

- [ ] **Step 3: Build smoke**

```bash
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/Section5Tool.tsx frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): Section 5 — la herramienta + tree silhouette"
```

---

## Task 8: Section 6 — CTA

Two big buttons. "Entrar al Árbol de la Vida" always shows; "Iniciar sesión" only when anonymous. Replaces the placeholder bottom block we had since Task 1.

**Files:**
- Create: `frontend/src/inicio/components/Section6Cta.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Create `Section6Cta.tsx`**

```tsx
import InicioSection from './InicioSection';
import { useAuth } from '../../auth';

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Section 6 — CTA. Two buttons:
 *  - "Entrar al Árbol de la Vida" always visible; calls onEnterEspejo
 *    which the App turns into setActiveView('espejo').
 *  - "Iniciar sesión" only renders when the user is anonymous; opens the
 *    LoginModal with triggeredBy 'manual' (no draft to flush).
 */
export default function Section6Cta({ onEnterEspejo }: Props) {
  const auth = useAuth();
  const showLogin = auth.status === 'anonymous';

  return (
    <InicioSection className="text-center">
      <div className="flex flex-col md:flex-row items-center justify-center gap-4">
        <button
          type="button"
          onClick={onEnterEspejo}
          className="px-7 py-3.5 rounded-xl bg-amber-300/15 hover:bg-amber-300/25 active:bg-amber-300/30 border border-amber-300/40 text-amber-100 text-sm tracking-[0.14em] uppercase transition-colors shadow-[0_0_18px_rgba(233,195,73,0.18)]"
        >
          Entrar al Árbol de la Vida
        </button>
        {showLogin && (
          <button
            type="button"
            onClick={() => auth.openLoginModal('manual')}
            className="px-7 py-3.5 rounded-xl border border-stone-700/60 text-stone-300 hover:text-amber-100 hover:border-amber-300/40 text-sm tracking-[0.14em] uppercase transition-colors"
          >
            Iniciar sesión
          </button>
        )}
      </div>
    </InicioSection>
  );
}
```

- [ ] **Step 2: Plug into `InicioModule.tsx` and remove the placeholder**

Replace the entire `frontend/src/inicio/InicioModule.tsx` body with:

```tsx
import { motion } from 'framer-motion';
import Section1Hook from './components/Section1Hook';
import Section2Promise from './components/Section2Promise';
import Section3Path from './components/Section3Path';
import Section4Bridge from './components/Section4Bridge';
import Section5Tool from './components/Section5Tool';
import Section6Cta from './components/Section6Cta';

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Welcome / manifiesto landing. Long-scroll page broken into six section
 * components rendered by this container. The final CTA fires
 * `onEnterEspejo`, which the App-level handler turns into a
 * `setActiveView('espejo')`.
 */
export default function InicioModule({ onEnterEspejo }: Props) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto px-6 md:px-8"
    >
      <Section1Hook />
      <Section2Promise />
      <Section3Path />
      <Section4Bridge />
      <Section5Tool />
      <Section6Cta onEnterEspejo={onEnterEspejo} />
    </motion.main>
  );
}
```

- [ ] **Step 3: Build smoke**

```bash
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/Section6Cta.tsx frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): Section 6 — CTA buttons (entrar + iniciar sesión)"
```

---

## Task 9: Manual verification + push + open PR

**Files:** none

- [ ] **Step 1: Final type-check + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run lint
npm run build
```

Expected: tsc clean, lint at most the 2 pre-existing warnings in `SefiraDetailPanel.tsx`, build succeeds.

- [ ] **Step 2: Boot the dev server and run through the manual matrix**

Backend:

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\backend"
./venv/Scripts/python.exe -m uvicorn main:app --reload
```

Frontend:

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npm run dev
```

Open http://localhost:5173 in a hard-reloaded fresh tab.

- [ ] **A — Default landing:** the page opens on the manifiesto, NOT the Tree. The page header ("Mi Árbol de la Vida" + subtitle) is NOT visible — only the manifiesto has its own typography.

- [ ] **B — Sidebar nav:** the rail's first icon is `auto_stories` (book) labeled "Bienvenida". Clicking the second icon (`account_tree`) switches to the Tree of Life; clicking back to the first icon returns to the manifiesto.

- [ ] **C — Scroll animations:** scrolling reveals each section. Section 1 has a softly pulsing orb. Section 2's horizontal line draws on enter. Section 3's three dots fade in then connect. Section 4's orb expands. Section 5 draws the tree silhouette. Section 6 has two buttons (when anon) or one (when authenticated).

- [ ] **D — CTA:** clicking "Entrar al Árbol de la Vida" switches to the Espejo. If it's the first visit of the session, the Espejo's intro plays.

- [ ] **E — Anonymous extras:** when logged out, the "Iniciar sesión" button is visible next to the primary CTA. Clicking it opens the LoginModal. After login, the button disappears (only the primary CTA stays).

- [ ] **F — `prefers-reduced-motion`:** in Chrome DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, the section fade-ups still happen but as simple opacity changes; the orbs don't pulse, the line draws are instant, the dots appear without scaling, the tree silhouette renders fully without staggered draws.

If any scenario fails, stop and report rather than committing further.

- [ ] **Step 3: Stop both dev servers (Ctrl+C in each terminal).**

- [ ] **Step 4: Verify the commit log**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space"
git log --oneline origin/main..HEAD
```

Expected: ~9 commits (the spec + 8 task commits).

- [ ] **Step 5: Push**

```bash
git push -u origin feat/inicio-manifiesto
```

- [ ] **Step 6: Open the PR**

```bash
gh pr create --title "feat(inicio): manifiesto landing page" --body "$(cat <<'EOF'
## Summary

A long-scroll welcome page that becomes the new default view, framing the central idea — *the journey to the universe begins inside* — before the user lands on the Tree of Life.

Six sections in `frontend/src/inicio/`, each with its own visual element:

1. **Hook** — pulsing orb + two-line statement.
2. **La promesa (general)** — Isaiah 11.9 verbatim + horizontal line draw.
3. **El camino (particular)** — three-dot constellation + rabbinic quote about Abraham and Jacob.
4. **El puente** — expanding orb + thesis statement.
5. **La herramienta** — silhouetted Tree of Life (10 empty nodes + 22 connections drawn with `pathLength`) + description of what the app does.
6. **CTA** — "Entrar al Árbol de la Vida" + "Iniciar sesión" (the latter only when anon).

## What changes for users

- New default landing: opens on the manifiesto instead of the Tree.
- New rail icon (\`auto_stories\`, "Bienvenida") at the top of the sidebar — accessible from any view.
- The Espejo intro animation still plays on first entry to the Tree per session, but no longer competes with the welcome flow.

## Out of scope

- Internationalization, scroll-depth tracking, A/B testing, audio narration. All listed in the spec's "Future" section.

## Test plan

- [x] \`tsc -b --noEmit\` clean
- [x] \`vite build\` clean
- [x] Manual: default landing, rail nav, scroll animations, CTA, anonymous-only login button, \`prefers-reduced-motion\`. All pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Note the PR URL** for the user.

---

## Done

After PR merges, the manifiesto becomes the default entry point. From there the user can read it in full, click "Entrar al Árbol de la Vida" to start using the app, or come back any time via the sidebar's first icon.
