# Manifiesto Cinematographic Enhance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer a cinematic atmosphere onto the existing six-section manifiesto landing — loading screen with counter, Instrument Serif italic display font, animated cosmic background, and an amber accent-gradient ring — without touching any of the manifiesto's content components.

**Architecture:** Two new components (`LoadingScreen`, `CosmicBackground`) live alongside the existing six section components inside `frontend/src/inicio/`. `InicioModule` orchestrates: shows `CosmicBackground` always behind the sections, gates `LoadingScreen` on a sessionStorage flag. The Tailwind 4 theme grows by one font token (`--font-display`) and one CSS utility (`.accent-gradient`). Three existing section components get small tweaks to consume the new typography and the accent ring.

**Tech Stack:** React 19 + TypeScript, framer-motion 11 (`motion`, `AnimatePresence`, `useReducedMotion`), Tailwind 4 (`@theme` directive in `index.css`), Instrument Serif via Google Fonts. No new npm deps.

**Branch:** continue on `feat/inicio-manifiesto`. PR #40 picks up the new commits automatically — when ready to ship, the squash-merge combines manifiesto + enhance into one commit.

**Test strategy:** No automated tests (frontend has no vitest setup). Verification via `tsc -b --noEmit`, `vite build`, and a manual scenario list at the end.

---

## Pre-Task: Confirm starting state

- [ ] **Step 1: Verify branch + base state**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space"
git status
git log --oneline -3
```

Expected: on `feat/inicio-manifiesto`, top commit is the enhance spec (`ed6a963` or later), build green. If you see uncommitted changes besides the untracked `kabbalah.db.bak*` and `kabbalah-space-logo.svg`, stop and clean up.

- [ ] **Step 2: Build smoke**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npm run build
```

Expected: vite build clean (~486 KB / ~145 KB gzip). If it fails, stop and report.

---

## Task 1: Theme tokens — Instrument Serif font + accent gradient utility + flicker keyframe

The manifiesto's typography and the loading screen's progress bar all hang off three additions to `index.css`:

- A new Google Fonts import for Instrument Serif (italic 400).
- A new `--font-display` token registered inside the existing `@theme` block (Tailwind 4 auto-derives `font-display` utility class).
- A `.accent-gradient` utility class for the amber gradient.
- A `@keyframes flicker` for the cosmic background stars.

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Open `frontend/src/index.css` and add the Instrument Serif import**

Find the first line of the file:

```css
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&family=Manrope:wght@200..800&family=Space+Grotesk:wght@300..700&display=swap');
```

Add this new line immediately after it (before the Material Symbols import):

```css
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap');
```

- [ ] **Step 2: Register the font in the `@theme` block**

Find the existing `@theme {` block (around the top of the file). Inside it, find the existing font tokens:

```css
  --font-headline: 'Newsreader', serif;
  --font-body: 'Manrope', sans-serif;
  --font-label: 'Space Grotesk', monospace;
```

Add this line right after them, inside the same `@theme {}` block:

```css
  --font-display: 'Instrument Serif', Georgia, serif;
```

- [ ] **Step 3: Add the accent-gradient utility + flicker keyframe at the end of the file**

Append at the very bottom of `frontend/src/index.css`:

```css
/* Amber accent gradient — used by the loading-screen progress bar and the
   manifiesto's primary CTA hover ring. */
.accent-gradient {
  background-image: linear-gradient(90deg, #e9c349 0%, #b8860b 100%);
}

/* Star flicker for the cosmic background. Each star gets a unique
   `animation-duration` and `animation-delay` via inline style. */
@keyframes flicker {
  0%, 100% { opacity: 0.3; }
  50%      { opacity: 1; }
}
```

- [ ] **Step 4: Type-check + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run build
```

Expected: clean. The new font/utility/keyframe are pure CSS and don't trigger TS errors. Bundle size may grow by a few KB for the new font.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(inicio): register Instrument Serif font + accent-gradient + flicker keyframe"
```

---

## Task 2: `LoadingScreen` component

Full-screen overlay that counts 000→100 in 2700ms, cycles three words, and fades out. Fires `onComplete` after the count hits 100 and a 400ms hold.

**Files:**
- Create: `frontend/src/inicio/components/LoadingScreen.tsx`

- [ ] **Step 1: Create the file with this exact content**

```tsx
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;
const DURATION_MS = 2700;
const HOLD_MS = 400;
const WORDS = ['Despertar', 'Reflejar', 'Crecer'] as const;
const WORD_INTERVAL_MS = 900;

type Props = {
  onComplete: () => void;
};

/**
 * Full-screen loading overlay shown once per browser session before the
 * manifiesto. Counts 000→100 in 2700ms via requestAnimationFrame, rotates
 * three words at the centre, and a thin amber progress bar tracks the count.
 * When the count reaches 100, waits HOLD_MS and fires onComplete; the
 * parent unmounts this component, which fades out via AnimatePresence.
 */
export default function LoadingScreen({ onComplete }: Props) {
  const [count, setCount] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);

  // Count 000 → 100 driven by rAF so it stays smooth under load.
  useEffect(() => {
    const start = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const next = Math.min(100, Math.round((elapsed / DURATION_MS) * 100));
      setCount(next);
      if (next < 100) {
        rafId = requestAnimationFrame(tick);
      } else {
        // Hold the "100" reading for HOLD_MS then hand off to the caller.
        window.setTimeout(onComplete, HOLD_MS);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onComplete]);

  // Rotate the centre word every 900ms.
  useEffect(() => {
    const id = window.setInterval(() => {
      setWordIndex((i) => (i + 1) % WORDS.length);
    }, WORD_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const padded = count.toString().padStart(3, '0');

  return (
    <motion.div
      key="loading-screen"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease }}
      className="fixed inset-0 z-[9999] bg-[#070709]"
      role="status"
      aria-label="Cargando la bienvenida"
    >
      {/* Top-left label */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease }}
        className="absolute top-6 left-6 md:top-10 md:left-10 text-xs uppercase tracking-[0.3em] text-stone-500"
      >
        Kabbalah Space
      </motion.div>

      {/* Centre rotating word */}
      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.span
            key={WORDS[wordIndex]}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.4, ease }}
            className="font-display italic text-5xl md:text-6xl lg:text-7xl text-amber-100/80"
          >
            {WORDS[wordIndex]}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Bottom-right counter */}
      <div className="absolute bottom-10 right-6 md:bottom-14 md:right-10 font-display italic text-6xl md:text-7xl lg:text-8xl text-amber-100/90 tabular-nums">
        {padded}
      </div>

      {/* Bottom progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-stone-800/50">
        <div
          className="accent-gradient h-full origin-left"
          style={{
            transform: `scaleX(${count / 100})`,
            boxShadow: '0 0 8px rgba(233, 195, 73, 0.35)',
          }}
        />
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Type-check + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run build
```

Expected: clean. The component is self-contained; nothing else imports it yet.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/inicio/components/LoadingScreen.tsx
git commit -m "feat(inicio): LoadingScreen with 000→100 counter + rotating words"
```

---

## Task 3: `CosmicBackground` component

Three layers stacked behind the manifiesto: gentle radial gradient, ~80 flickering stars (positions stable per mount), and two large blurred colour patches.

**Files:**
- Create: `frontend/src/inicio/components/CosmicBackground.tsx`

- [ ] **Step 1: Create the file with this exact content**

```tsx
import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';

type Star = {
  top: string;
  left: string;
  size: number;
  duration: number;
  delay: number;
};

const STAR_COUNT = 80;

/**
 * Three-layer cosmic background for the manifiesto:
 *   1. Radial gradient base (subtle, almost-black).
 *   2. 80 single-pixel stars at stable positions that flicker on a 3-8s loop.
 *   3. Two large blurred colour patches (amber + indigo) with mix-blend-screen.
 *
 * Renders behind the page content with `fixed inset-0 -z-10 pointer-events-none`.
 * Respects `prefers-reduced-motion`: stars stop flickering, gradient stops pulsing.
 */
export default function CosmicBackground() {
  const reduced = useReducedMotion();

  const stars: Star[] = useMemo(() => {
    return Array.from({ length: STAR_COUNT }, () => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() < 0.75 ? 1 : 2,
      duration: 3 + Math.random() * 5, // 3–8s
      delay: Math.random() * 5,         // 0–5s
    }));
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
    >
      {/* Layer 1 — radial gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, #0e1014 0%, #070709 60%, #000000 100%)',
        }}
      />

      {/* Layer 2 — stars */}
      <div className="absolute inset-0">
        {stars.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              top: s.top,
              left: s.left,
              width: `${s.size}px`,
              height: `${s.size}px`,
              opacity: 0.6,
              animation: reduced
                ? undefined
                : `flicker ${s.duration}s ease-in-out ${s.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Layer 3 — blurred colour patches */}
      <div
        className="absolute"
        style={{
          bottom: '-15%',
          left: '-10%',
          width: '600px',
          height: '600px',
          background: 'rgba(217, 119, 6, 0.15)',
          filter: 'blur(140px)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="absolute"
        style={{
          top: '-10%',
          right: '-5%',
          width: '500px',
          height: '500px',
          background: 'rgba(67, 56, 202, 0.12)',
          filter: 'blur(120px)',
          mixBlendMode: 'screen',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/inicio/components/CosmicBackground.tsx
git commit -m "feat(inicio): CosmicBackground — radial base + 80 flickering stars + colour patches"
```

---

## Task 4: Refactor `Section1Hook` — font-display + cinematic blur entrance

Two changes: swap the `<h1>` from `font-serif` to `font-display italic`, and add a self-contained `motion` entrance (opacity + y-translate + blur) for the headline. The orb's pulse loop stays, but its first appearance is delayed 0.6s after the headline for a staggered feel.

**Files:**
- Modify: `frontend/src/inicio/components/Section1Hook.tsx`

- [ ] **Step 1: Replace the file content with this updated version**

```tsx
import { motion, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';

const ORB_COLOR = '#e9c349';
const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Section 1 — Hook. A two-line statement and a softly pulsing orb.
 * The headline enters with a 1.2s blur-fade so the manifiesto opens
 * cinematically right after the loading screen hands off; the orb's
 * pulse loop kicks in after a 0.6s stagger.
 */
export default function Section1Hook() {
  const reduced = useReducedMotion();
  return (
    <InicioSection className="min-h-[80vh] flex flex-col items-center justify-center text-center">
      <motion.h1
        initial={{
          opacity: 0,
          y: reduced ? 0 : 30,
          filter: reduced ? 'blur(0px)' : 'blur(10px)',
        }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: reduced ? 0.4 : 1.2, ease, delay: 0.1 }}
        className="font-display italic tracking-tight text-amber-100/90 text-5xl md:text-7xl leading-tight mb-12"
      >
        El viaje hacia el universo
        <br />
        empieza adentro.
      </motion.h1>
      <motion.div
        initial={{ opacity: 0 }}
        animate={
          reduced
            ? { opacity: 1 }
            : { scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }
        }
        transition={{
          duration: 4,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatType: 'mirror',
          delay: 0.6,
        }}
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

The diff vs. the previous version:
- `<h1>` becomes `<motion.h1>` with explicit blur+y entrance.
- Class swaps `font-serif font-light` → `font-display italic` (drops `font-light` because Instrument Serif italic 400 is the only weight loaded).
- `<motion.div>` orb gets `initial={{ opacity: 0 }}` and a `delay: 0.6` on its transition so it appears after the headline settles.

- [ ] **Step 2: Type-check + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/inicio/components/Section1Hook.tsx
git commit -m "feat(inicio): Section 1 headline uses font-display italic + cinematic blur entrance"
```

---

## Task 5: Refactor `Section4Bridge` — font-display

Just the typography swap on the `<h2>`. The orb expansion stays.

**Files:**
- Modify: `frontend/src/inicio/components/Section4Bridge.tsx`

- [ ] **Step 1: In `frontend/src/inicio/components/Section4Bridge.tsx`, find this `<h2>`**

```tsx
      <h2 className="font-serif font-light tracking-tight text-amber-100/90 text-3xl md:text-5xl leading-tight mb-10">
        Conocer el universo empieza
        <br />
        por conocerte a vos mismo.
      </h2>
```

Replace with:

```tsx
      <h2 className="font-display italic tracking-tight text-amber-100/90 text-3xl md:text-5xl leading-tight mb-10">
        Conocer el universo empieza
        <br />
        por conocerte a vos mismo.
      </h2>
```

(Class change: `font-serif font-light` → `font-display italic`. Same reasoning as Section 1.)

- [ ] **Step 2: Type-check + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/inicio/components/Section4Bridge.tsx
git commit -m "feat(inicio): Section 4 headline uses font-display italic"
```

---

## Task 6: Refactor `Section6Cta` — accent gradient hover ring on primary button

Replace the static amber `shadow-[...]` on the "Entrar al Árbol de la Vida" button with a hover-revealed accent-gradient ring (a wrapper `<span>` behind the button content). Apply the same pattern to the "Iniciar sesión" button for consistency.

**Files:**
- Modify: `frontend/src/inicio/components/Section6Cta.tsx`

- [ ] **Step 1: Replace the file content with this updated version**

```tsx
import InicioSection from './InicioSection';
import { useAuth } from '../../auth';

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Section 6 — CTA. Two buttons:
 *  - "Entrar al Árbol de la Vida" always visible; calls onEnterEspejo
 *    which the App turns into setActiveView('espejo'). On hover an
 *    accent-gradient ring slides behind the button.
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
          className="group relative px-7 py-3.5 rounded-xl text-amber-100 text-sm tracking-[0.14em] uppercase transition-colors"
        >
          {/* Hover-revealed accent gradient ring */}
          <span
            aria-hidden
            className="accent-gradient absolute -inset-[2px] rounded-[14px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          />
          {/* Solid inner pill so the gradient reads as a ring */}
          <span className="relative block bg-stone-950/85 backdrop-blur-md border border-amber-300/40 rounded-xl px-7 py-3.5 -mx-7 -my-3.5">
            Entrar al Árbol de la Vida
          </span>
        </button>

        {showLogin && (
          <button
            type="button"
            onClick={() => auth.openLoginModal('manual')}
            className="group relative px-7 py-3.5 rounded-xl text-stone-300 hover:text-amber-100 text-sm tracking-[0.14em] uppercase transition-colors"
          >
            <span
              aria-hidden
              className="accent-gradient absolute -inset-[2px] rounded-[14px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            />
            <span className="relative block bg-stone-950/85 backdrop-blur-md border border-stone-700/60 group-hover:border-transparent rounded-xl px-7 py-3.5 -mx-7 -my-3.5 transition-colors">
              Iniciar sesión
            </span>
          </button>
        )}
      </div>
    </InicioSection>
  );
}
```

The pattern: each `<button>` has an absolute `<span>` with `.accent-gradient` that's `opacity-0` by default and `opacity-100` on `group-hover`. The button's visible body is a `<span>` with `bg-stone-950/85` that sits on top, leaving only ~2px of the gradient visible as a ring.

- [ ] **Step 2: Type-check + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/inicio/components/Section6Cta.tsx
git commit -m "feat(inicio): Section 6 CTAs use accent-gradient hover ring"
```

---

## Task 7: Wire `LoadingScreen` + `CosmicBackground` into `InicioModule`

Replace the body of `InicioModule.tsx` to render `<CosmicBackground />` always, and `<LoadingScreen />` only on the first visit of the session (gated by a `sessionStorage` flag). When the loading screen completes, the flag is set and the screen unmounts.

**Files:**
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Replace the file content with this updated version**

```tsx
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Section1Hook from './components/Section1Hook';
import Section2Promise from './components/Section2Promise';
import Section3Path from './components/Section3Path';
import Section4Bridge from './components/Section4Bridge';
import Section5Tool from './components/Section5Tool';
import Section6Cta from './components/Section6Cta';
import LoadingScreen from './components/LoadingScreen';
import CosmicBackground from './components/CosmicBackground';

const LOADING_FLAG = 'kabbalah-loading-done';

function shouldSkipLoading(): boolean {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return true;
  }
  return window.sessionStorage.getItem(LOADING_FLAG) === '1';
}

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Welcome / manifiesto landing. Renders the cosmic background, an optional
 * one-time loading screen (gated by sessionStorage), and the six manifiesto
 * sections in order. The CTA at the end fires `onEnterEspejo`, which the
 * App-level handler turns into a `setActiveView('espejo')`.
 */
export default function InicioModule({ onEnterEspejo }: Props) {
  const [loadingDone, setLoadingDone] = useState<boolean>(() => shouldSkipLoading());

  const handleLoadingComplete = () => {
    try {
      window.sessionStorage.setItem(LOADING_FLAG, '1');
    } catch {
      /* sessionStorage may be unavailable (private mode); ignore */
    }
    setLoadingDone(true);
  };

  return (
    <>
      <CosmicBackground />
      <AnimatePresence>
        {!loadingDone && <LoadingScreen key="loading" onComplete={handleLoadingComplete} />}
      </AnimatePresence>
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
    </>
  );
}
```

- [ ] **Step 2: Type-check + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): wire LoadingScreen + CosmicBackground into InicioModule"
```

---

## Task 8: Manual verification + push

**Files:** none

- [ ] **Step 1: Final type-check + lint + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run lint
npm run build
```

Expected: tsc clean, lint warnings limited to the pre-existing two in `SefiraDetailPanel.tsx`, build clean (bundle may grow ~10 KB for the new font + components).

- [ ] **Step 2: Manual scenario matrix**

Boot the dev server:

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\backend"
./venv/Scripts/python.exe -m uvicorn main:app --reload
# (in another terminal)
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npm run dev
```

In a **fresh tab** (so sessionStorage is empty) at http://localhost:5173:

- [ ] **A — Loading screen fires on first visit:** the loading screen appears immediately, "KABBALAH SPACE" label top-left, a word cycles centre (Despertar → Reflejar → Crecer), counter 000→100 in the bottom-right, amber progress bar fills left→right.
- [ ] **B — Loading screen fades out:** when the counter hits 100, hold ~400 ms, then a smooth fade-out reveals the manifiesto behind it.
- [ ] **C — Section 1 cinematic entrance:** the headline "El viaje hacia el universo / empieza adentro." comes in blurred + offset and resolves crisp in ~1.2 s. The orb fades in shortly after and starts its pulse.
- [ ] **D — Cosmic background visible:** behind the sections you should see a subtle radial darkness, a sprinkle of faint stars, and two distant colour patches (warm amber bottom-left, cool indigo top-right). Stars flicker on slow loops.
- [ ] **E — Typography switch:** the Section 1 headline is in Instrument Serif italic (a tighter, more poetic serif than the body text). Section 4's "Conocer el universo empieza / por conocerte a vos mismo." uses the same font.
- [ ] **F — CTA hover ring:** hovering "Entrar al Árbol de la Vida" reveals a warm gradient ring around the button. Same on "Iniciar sesión" when anon.
- [ ] **G — Loading screen does NOT re-fire on intra-session navigation:** click the Espejo rail icon, then click back to the Bienvenida icon — the manifiesto appears directly, no loading screen.
- [ ] **H — Hard refresh keeps the skip:** F5 within the same tab — loading screen is still skipped (sessionStorage flag persists for tab-group lifetime).
- [ ] **I — `prefers-reduced-motion`:** in Chrome DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, the loading screen still works but: words rotate without slide animations, the headline blur is gone, stars are static, the orb doesn't pulse.

If any scenario fails, stop and report rather than committing further.

- [ ] **Step 3: Stop both dev servers (Ctrl+C in each terminal).**

- [ ] **Step 4: Verify the commit log**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space"
git log --oneline origin/feat/inicio-manifiesto..HEAD
```

Expected: 7 new commits on top of the existing PR #40 branch (spec + 7 task commits).

- [ ] **Step 5: Push to the existing branch**

```bash
git push
```

PR #40 picks up the new commits automatically. No new PR needed.

- [ ] **Step 6: Add a comment to PR #40 describing the enhance**

```bash
gh pr comment 40 --body "$(cat <<'EOF'
## Cinematographic enhance (commits on top of the manifiesto)

Layered onto the existing six-section manifiesto without touching the content:

- **LoadingScreen** — 000→100 counter, three rotating words (Despertar / Reflejar / Crecer), amber progress bar. Fires once per browser session (sessionStorage flag `kabbalah-loading-done`).
- **CosmicBackground** — radial gradient base + 80 flickering stars at stable positions + two large blurred colour patches (amber + indigo) with `mix-blend-screen`.
- **Instrument Serif italic** for the display headlines (Section 1 + Section 4 + loading screen elements). Imported via Google Fonts, registered as `--font-display` in the Tailwind 4 `@theme` block.
- **Accent-gradient ring** on the CTA buttons — appears on hover, reuses the new `.accent-gradient` utility.
- **`prefers-reduced-motion`** respected everywhere: blur omitted, pulse stopped, flicker disabled.

Out of scope: HLS video (no asset), GSAP (framer-motion covers our needs), portfolio-style sections (Works/Journal/Stats — not applicable).
EOF
)"
```

---

## Done

After PR #40 merges (squash), the manifiesto + enhance ship together as a single commit on `main`.
