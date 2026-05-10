# Landing Marketing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the contemplative six-section manifiesto with a marketing-style landing built on the gold-on-dark CSS framework the user provided: nav, hero, condensed premise, modules showcase, sefirot grid, marquee, final CTA, footer.

**Architecture:** New branch off `main` (PR #40 closed without merging). The `inicio` module is gutted and rebuilt: nine fresh section components plus an inline-SVG logo wrapper. `LoadingScreen` and `CosmicBackground` from the previous enhance survive intact. CSS tokens (gold palette, surface, line) get registered in the Tailwind 4 `@theme` block; component utilities (`.ks-btn-primary`, `.ks-module-card`, etc.) and keyframes (`ksBlurIn`, `ksMarquee`, `ksScrollDown`) live as global utility classes at the bottom of `index.css`.

**Tech Stack:** React 19 + TypeScript, framer-motion 11 (`useInView`, `useReducedMotion`), Tailwind 4 (`@theme` directive in `index.css`). No new npm deps.

**Branch & merge:** `feat/inicio-landing` (created in Pre-Task), open as new PR (will be #41+). PR #40 closes without merging — its commits stay in github history under the `feat/inicio-manifiesto` branch.

**Test strategy:** No automated tests (frontend has no vitest setup). Verification via `tsc -b --noEmit`, `vite build`, and a manual scenario list at the end.

---

## Pre-Task: Branch hygiene + close PR #40

We're replacing the manifiesto, not iterating on it. Push the current state of `feat/inicio-manifiesto` so the github history captures the spec, then branch from `main` and cherry-pick the spec into the new branch.

- [ ] **Step 1: Push the current branch so the spec commit is in github**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space"
git status
git log --oneline -3
git push
```

Expected: on `feat/inicio-manifiesto`, top commit is `Add design spec for inicio landing rebuild (marketing-style)`. Push succeeds.

- [ ] **Step 2: Note the spec commit SHA for cherry-picking**

```bash
git log --oneline -1
```

Save the SHA (e.g. `1cac53a`). You'll need it in Step 5.

- [ ] **Step 3: Switch to main and pull**

```bash
git checkout main
git pull --ff-only
```

Expected: on `main`, up to date with origin. `main` contains the PR #38 merge (gated save) but NOT the manifiesto or its enhance, because PR #40 was never merged.

- [ ] **Step 4: Create the new branch from main**

```bash
git checkout -b feat/inicio-landing
```

Expected: switched to new branch `feat/inicio-landing`.

- [ ] **Step 5: Cherry-pick the spec commit so it lives in the new branch too**

```bash
git cherry-pick <SHA-from-Step-2>
```

If the cherry-pick conflicts on `docs/superpowers/plans/` (which it won't, the plan you're reading is added later as part of this branch's work) — resolve cleanly. Expected: no conflicts, commit cherry-picked successfully.

- [ ] **Step 6: Close PR #40 with an explanation**

```bash
gh pr close 40 --comment "Closing without merging. The contemplative manifiesto has been superseded by a marketing landing redesign — spec at \`docs/superpowers/specs/2026-05-10-landing-marketing-redesign-design.md\` (cherry-picked into the new branch). The commits on this branch stay in github's history for reference. New work continues on \`feat/inicio-landing\`."
```

- [ ] **Step 7: Build smoke from the new base**

```bash
cd frontend
npm run build
```

Expected: vite build succeeds. (At this point the inicio module is still the manifiesto with all six sections — that gets dismantled in Task 3.)

---

## Task 1: Theme tokens — colors + ks-utility classes + keyframes

The whole landing's visual layer hangs off `index.css`. Register the gold palette as Tailwind 4 color tokens, add the component utility classes, and define the keyframes.

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add color tokens inside the existing `@theme {}` block**

Open `frontend/src/index.css`. Find the existing `@theme {` block. After the `--font-display` line that was added earlier, add these color tokens (still inside the same `@theme {}` block, before the closing `}`):

```css
  /* Landing colour palette — gold-on-dark marketing aesthetic. */
  --color-bg-deep:    #050507;
  --color-surface-1:  #0e0e10;
  --color-ink:        #e5e2e1;
  --color-ink-glow:   #fff5e4;
  --color-gold:       #e9c349;
  --color-gold-deep:  #9a7c1f;
  --color-line:       rgba(120,113,90,0.22);
```

(Tailwind 4 auto-generates utility classes for each: `bg-bg-deep`, `bg-surface-1`, `text-ink`, `text-ink-glow`, `text-gold`, `text-gold-deep`, `border-line`, etc.)

- [ ] **Step 2: Add the utility classes and keyframes at the bottom of the file**

After the existing `.accent-gradient` rule and `@keyframes flicker` (from the previous enhance), append:

```css
/* ---------- Landing utility classes ---------- */

.ks-serif {
  font-family: 'Newsreader', serif;
  letter-spacing: -0.005em;
}

.ks-eyebrow {
  font-family: 'Space Grotesk', monospace;
  font-size: 10px;
  color: #a8a39a;
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-weight: 400;
}

.ks-body {
  font-family: 'Manrope', sans-serif;
  font-weight: 300;
  color: rgba(168, 163, 154, 0.92);
  line-height: 1.7;
}

.ks-nav-link {
  font-family: 'Manrope', sans-serif;
  font-size: 13px;
  font-weight: 400;
  color: rgba(168, 163, 154, 0.8);
  padding: 7px 14px;
  border-radius: 9999px;
  text-decoration: none;
  transition: color 0.2s, background 0.2s;
}
.ks-nav-link:hover {
  color: #fff5e4;
  background: rgba(233, 195, 73, 0.06);
}

.ks-nav-cta {
  font-family: 'Manrope', sans-serif;
  font-size: 13px;
  color: #fff5e4;
  text-decoration: none;
  padding: 7px 14px;
  border-radius: 9999px;
  background: linear-gradient(135deg, rgba(233, 195, 73, 0.2), rgba(154, 124, 31, 0.1));
  border: 1px solid rgba(233, 195, 73, 0.35);
  display: inline-flex;
  gap: 6px;
  align-items: center;
  transition: background 0.2s;
  cursor: pointer;
}
.ks-nav-cta:hover {
  background: linear-gradient(135deg, rgba(233, 195, 73, 0.35), rgba(154, 124, 31, 0.2));
}

.ks-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: 'Manrope', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #1a1100;
  background: linear-gradient(135deg, #fff5e4, #e9c349 60%, #9a7c1f);
  padding: 14px 26px;
  border-radius: 9999px;
  text-decoration: none;
  border: none;
  cursor: pointer;
  box-shadow:
    0 0 30px rgba(233, 195, 73, 0.25),
    0 0 60px rgba(233, 195, 73, 0.12);
  transition: transform 0.2s, box-shadow 0.2s;
}
.ks-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow:
    0 0 36px rgba(233, 195, 73, 0.4),
    0 0 80px rgba(233, 195, 73, 0.18);
}

.ks-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: 'Manrope', sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: #fff5e4;
  text-decoration: none;
  padding: 13px 24px;
  border-radius: 9999px;
  border: 1px solid rgba(120, 113, 90, 0.4);
  background: rgba(14, 14, 16, 0.5);
  backdrop-filter: blur(10px);
  transition: border-color 0.2s, background 0.2s;
  cursor: pointer;
}
.ks-btn-ghost:hover {
  border-color: rgba(233, 195, 73, 0.5);
  background: rgba(233, 195, 73, 0.05);
}

.ks-pill {
  font-family: 'Space Grotesk', monospace;
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #e9c349;
  background: rgba(233, 195, 73, 0.1);
  border: 1px solid rgba(233, 195, 73, 0.25);
  padding: 3px 8px;
  border-radius: 9999px;
}

.ks-module-card {
  background: #0e0e10;
  border: 1px solid rgba(120, 113, 90, 0.22);
  border-radius: 22px;
  overflow: hidden;
  transition: border-color 0.35s, transform 0.35s, box-shadow 0.35s;
  position: relative;
}
.ks-module-card:hover {
  border-color: rgba(233, 195, 73, 0.45);
  transform: translateY(-3px);
  box-shadow:
    0 24px 60px -20px rgba(0, 0, 0, 0.7),
    0 0 40px rgba(233, 195, 73, 0.06);
}

.ks-sef-card {
  background: #0e0e10;
  border: 1px solid rgba(120, 113, 90, 0.18);
  border-radius: 14px;
  padding: 18px 18px 16px;
  transition: border-color 0.25s, background 0.25s;
}
.ks-sef-card:hover {
  border-color: rgba(233, 195, 73, 0.4);
  background: rgba(28, 27, 27, 0.7);
}

/* ---------- Landing keyframes ---------- */

@keyframes ksScrollDown {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(200%); }
}
.ks-scroll-down { animation: ksScrollDown 1.6s ease-in-out infinite; }

@keyframes ksBlurIn {
  from { opacity: 0; filter: blur(10px); transform: translateY(20px); }
  to   { opacity: 1; filter: blur(0); transform: translateY(0); }
}
.ks-blur-in    { animation: ksBlurIn 1.1s 0.2s ease-out backwards; }
.ks-name-reveal { animation: ksBlurIn 1.4s 0.05s ease-out backwards; }

@keyframes ksMarquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.ks-marquee { animation: ksMarquee 60s linear infinite; }

@media (prefers-reduced-motion: reduce) {
  .ks-blur-in,
  .ks-name-reveal,
  .ks-scroll-down,
  .ks-marquee {
    animation: none;
  }
}
```

- [ ] **Step 3: Type-check + build**

```bash
cd frontend
npx tsc -b --noEmit
npm run build
```

Expected: clean. New tokens may add a few KB of CSS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(inicio): register landing palette tokens + ks-* utilities + keyframes"
```

---

## Task 2: `KabbalahLogo` + `InicioNav`

Two components in one task because the nav always renders the logo and they ship together.

**Files:**
- Create: `frontend/src/inicio/components/KabbalahLogo.tsx`
- Create: `frontend/src/inicio/components/InicioNav.tsx`

- [ ] **Step 1: Create `KabbalahLogo.tsx`**

```tsx
import { SEFIRA_COLORS } from '../../shared/tokens';

type Props = {
  size?: 'sm' | 'md';
};

/**
 * Inline-SVG logo wordmark adapted for dark backgrounds. The original
 * `kabbalah-space-logo.svg` ships navy-on-light coloring that doesn't read
 * over `--color-bg-deep`; this component draws a simplified tree icon in
 * gold next to "Kabbalah ✦ Space" text using the Newsreader serif.
 *
 * The mini tree mirrors the proportions of SefirotInteractiveTree
 * (10 sefirot at known positions, 22 connections) but scaled to a tiny
 * 100×90 viewBox and rendered with gold strokes/fills.
 */
export default function KabbalahLogo({ size = 'sm' }: Props) {
  const dim = size === 'sm' ? 32 : 44;
  const text = size === 'sm' ? 'text-base' : 'text-2xl';

  // Sefirot positions normalised to 100×90 viewBox.
  const nodes = [
    { id: 'keter',   x: 50, y: 8 },
    { id: 'jojma',   x: 78, y: 22 },
    { id: 'bina',    x: 22, y: 22 },
    { id: 'jesed',   x: 78, y: 40 },
    { id: 'gevura',  x: 22, y: 40 },
    { id: 'tiferet', x: 50, y: 50 },
    { id: 'netzaj',  x: 78, y: 64 },
    { id: 'hod',     x: 22, y: 64 },
    { id: 'yesod',   x: 50, y: 74 },
    { id: 'maljut',  x: 50, y: 84 },
  ];
  const connections: [string, string][] = [
    ['keter', 'jojma'], ['keter', 'bina'], ['keter', 'tiferet'],
    ['jojma', 'bina'], ['jojma', 'tiferet'], ['bina', 'tiferet'],
    ['jojma', 'jesed'], ['bina', 'gevura'],
    ['jesed', 'gevura'], ['jesed', 'tiferet'], ['gevura', 'tiferet'],
    ['jesed', 'netzaj'], ['gevura', 'hod'],
    ['netzaj', 'tiferet'], ['hod', 'tiferet'], ['yesod', 'tiferet'],
    ['netzaj', 'hod'], ['netzaj', 'yesod'], ['hod', 'yesod'],
    ['netzaj', 'maljut'], ['hod', 'maljut'], ['yesod', 'maljut'],
  ];
  const find = (id: string) => nodes.find((n) => n.id === id)!;

  return (
    <span className="inline-flex items-center gap-3">
      <svg
        width={dim}
        height={dim * 0.9}
        viewBox="0 0 100 90"
        aria-hidden
        className="shrink-0"
      >
        {connections.map(([a, b]) => {
          const na = find(a);
          const nb = find(b);
          return (
            <line
              key={`${a}-${b}`}
              x1={na.x}
              y1={na.y}
              x2={nb.x}
              y2={nb.y}
              stroke="rgba(233,195,73,0.35)"
              strokeWidth={0.9}
            />
          );
        })}
        {nodes.map((n) => (
          <circle
            key={n.id}
            cx={n.x}
            cy={n.y}
            r={3.2}
            fill={SEFIRA_COLORS[n.id] ?? '#e9c349'}
            stroke="rgba(255,245,228,0.6)"
            strokeWidth={0.4}
          />
        ))}
      </svg>
      <span className={`ks-serif ${text} font-light tracking-tight whitespace-nowrap`}>
        <span className="text-ink-glow">Kabbalah</span>
        <span className="text-gold mx-1.5">✦</span>
        <span className="italic text-ink-glow">Space</span>
      </span>
    </span>
  );
}
```

- [ ] **Step 2: Create `InicioNav.tsx`**

```tsx
import { useEffect, useState } from 'react';
import KabbalahLogo from './KabbalahLogo';
import { useAuth } from '../../auth';

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Fixed nav at the top of the landing. Backdrop-blur intensifies after
 * the user scrolls past 100px. Anonymous users see "Iniciar sesión" as
 * the CTA; authenticated users see "Entrar al Árbol" instead.
 */
export default function InicioNav({ onEnterEspejo }: Props) {
  const auth = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isAnon = auth.status === 'anonymous';

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'backdrop-blur-md bg-bg-deep/80 border-b border-line'
          : 'backdrop-blur-sm bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-3 flex items-center justify-between">
        <KabbalahLogo size="sm" />

        <div className="hidden md:flex items-center gap-1">
          <a href="#premisa" className="ks-nav-link">Manifiesto</a>
          <a href="#sefirot" className="ks-nav-link">Sefirot</a>
        </div>

        <div className="flex items-center gap-2">
          {isAnon ? (
            <button
              type="button"
              onClick={() => auth.openLoginModal('manual')}
              className="ks-nav-cta"
            >
              Iniciar sesión <span aria-hidden>↗</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onEnterEspejo}
              className="ks-nav-cta"
            >
              Entrar al Árbol <span aria-hidden>↗</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Type-check + build**

```bash
cd frontend
npx tsc -b --noEmit
npm run build
```

Expected: clean. The components are self-contained; nothing else imports them yet.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/KabbalahLogo.tsx frontend/src/inicio/components/InicioNav.tsx
git commit -m "feat(inicio): KabbalahLogo + InicioNav (gold tree icon + wordmark, fixed nav)"
```

---

## Task 3: Rewrite `InicioModule` + delete obsolete manifiesto components

The previous six section components and the `InicioSection` wrapper are obsolete. Delete them. Rewrite `InicioModule` to render only `CosmicBackground` + `LoadingScreen` + `InicioNav` for now — sections get added one per task afterwards.

**Files:**
- Delete: `frontend/src/inicio/components/Section1Hook.tsx`
- Delete: `frontend/src/inicio/components/Section2Promise.tsx`
- Delete: `frontend/src/inicio/components/Section3Path.tsx`
- Delete: `frontend/src/inicio/components/Section4Bridge.tsx`
- Delete: `frontend/src/inicio/components/Section5Tool.tsx`
- Delete: `frontend/src/inicio/components/Section6Cta.tsx`
- Delete: `frontend/src/inicio/components/InicioSection.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Delete the obsolete files**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space"
rm frontend/src/inicio/components/Section1Hook.tsx
rm frontend/src/inicio/components/Section2Promise.tsx
rm frontend/src/inicio/components/Section3Path.tsx
rm frontend/src/inicio/components/Section4Bridge.tsx
rm frontend/src/inicio/components/Section5Tool.tsx
rm frontend/src/inicio/components/Section6Cta.tsx
rm frontend/src/inicio/components/InicioSection.tsx
```

- [ ] **Step 2: Replace the body of `frontend/src/inicio/InicioModule.tsx`**

Replace the entire file with:

```tsx
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import LoadingScreen from './components/LoadingScreen';
import CosmicBackground from './components/CosmicBackground';
import InicioNav from './components/InicioNav';

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
 * Landing page for Kabbalah Space. Marketing-style layout: nav, hero,
 * premise, modules, sefirot grid, marquee, final CTA, footer. Sections
 * get added one task at a time after this scaffolding lands.
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
      <InicioNav onEnterEspejo={onEnterEspejo} />
      <main className="relative">
        {/* Hero + sections land here in subsequent tasks. */}
      </main>
    </>
  );
}
```

- [ ] **Step 3: Type-check + build**

```bash
cd frontend
npx tsc -b --noEmit
npm run build
```

Expected: clean. The deleted files no longer have references (since `InicioModule` no longer imports them), so deletion is safe.

- [ ] **Step 4: Commit**

```bash
git add -u frontend/src/inicio/
git commit -m "refactor(inicio): tear down manifiesto sections + scaffold landing"
```

(The `-u` flag stages both modifications and deletions for tracked files inside `frontend/src/inicio/`.)

---

## Task 4: `InicioHero` + wire into `InicioModule`

**Files:**
- Create: `frontend/src/inicio/components/InicioHero.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Create `InicioHero.tsx`**

```tsx
type Props = {
  onEnterEspejo: () => void;
};

/**
 * Section 1 of the landing — full-viewport hero. Title and tagline use
 * CSS keyframes (ks-name-reveal, ks-blur-in) that fire on mount, so the
 * page opens cinematically right after the loading screen hands off.
 * A pair of CTAs sits below the body copy; a small scroll indicator
 * anchors the bottom of the viewport.
 */
export default function InicioHero({ onEnterEspejo }: Props) {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-32 md:pt-48 pb-24 text-center">
      <span className="ks-pill ks-blur-in mb-8">Aleph 1</span>

      <h1 className="ks-serif ks-name-reveal text-6xl md:text-8xl lg:text-9xl font-light italic tracking-tight text-ink-glow mb-6 leading-[0.9]">
        Kabbalah Space
      </h1>

      <p className="ks-serif ks-blur-in text-2xl md:text-3xl italic text-gold/85 mb-8">
        Inteligencia del Ser.
      </p>

      <p className="ks-body ks-blur-in max-w-md mb-12 text-base md:text-lg" style={{ animationDelay: '0.5s' }}>
        El conocimiento del universo empieza por adentro.
        Mapeá las diez dimensiones de tu alma a través del Árbol de la Vida.
      </p>

      <div className="flex flex-col md:flex-row items-center gap-4 ks-blur-in" style={{ animationDelay: '0.7s' }}>
        <button type="button" onClick={onEnterEspejo} className="ks-btn-primary">
          Entrar al Árbol
          <span aria-hidden>→</span>
        </button>
        <a href="#premisa" className="ks-btn-ghost">
          Cómo funciona
          <span aria-hidden>↓</span>
        </a>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
        <span className="ks-eyebrow">Scroll</span>
        <div className="relative w-px h-10 bg-line overflow-hidden">
          <div className="ks-scroll-down absolute top-0 left-0 right-0 h-1/3 bg-gold" />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire `InicioHero` into `InicioModule`**

In `frontend/src/inicio/InicioModule.tsx`, find:

```tsx
import InicioNav from './components/InicioNav';
```

Add right after:

```tsx
import InicioHero from './components/InicioHero';
```

Then find:

```tsx
      <main className="relative">
        {/* Hero + sections land here in subsequent tasks. */}
      </main>
```

Replace with:

```tsx
      <main className="relative">
        <InicioHero onEnterEspejo={onEnterEspejo} />
        {/* Premisa, modules, sefirot, marquee, CTA, footer land in later tasks. */}
      </main>
```

- [ ] **Step 3: Type-check + build**

```bash
cd frontend
npx tsc -b --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/InicioHero.tsx frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): InicioHero (title + tagline + CTAs + scroll indicator)"
```

---

## Task 5: `InicioPremisa` + wire

**Files:**
- Create: `frontend/src/inicio/components/InicioPremisa.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Create `InicioPremisa.tsx`**

```tsx
import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Section 2 — the condensed manifiesto. Two short paragraphs that take
 * the heart of the contemplative manifiesto (general → particular → bridge)
 * and compress it into a marketing-friendly opening. The section reveals
 * via useInView when scrolled into view.
 */
export default function InicioPremisa() {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();

  return (
    <motion.section
      ref={ref}
      id="premisa"
      initial={{ opacity: 0, y: reduced ? 0 : 28 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 28 }}
      transition={{ duration: 1, ease }}
      className="relative max-w-3xl mx-auto px-6 py-24 md:py-32 text-center"
    >
      <div className="ks-eyebrow mb-6">Premisa</div>
      <h2 className="ks-serif text-3xl md:text-5xl italic text-ink-glow tracking-tight mb-10 leading-tight">
        El conocimiento del universo
        <br />
        empieza por adentro.
      </h2>
      <p className="ks-body text-base md:text-lg mb-6">
        Llegará un día en que la humanidad entera conocerá el misterio en el que vive.
        Pero ese día no nace de la multitud — nace en cada persona que decide mirar adentro.
      </p>
      <p className="ks-body text-base md:text-lg">
        Kabbalah Space mapea las diez dimensiones del alma — las sefirot —
        para que veas, día a día, cuál vibra y cuál se calla.
      </p>
    </motion.section>
  );
}
```

- [ ] **Step 2: Wire into `InicioModule`**

In `frontend/src/inicio/InicioModule.tsx`, add the import right after `InicioHero`:

```tsx
import InicioPremisa from './components/InicioPremisa';
```

Then find:

```tsx
        <InicioHero onEnterEspejo={onEnterEspejo} />
        {/* Premisa, modules, sefirot, marquee, CTA, footer land in later tasks. */}
```

Replace with:

```tsx
        <InicioHero onEnterEspejo={onEnterEspejo} />
        <InicioPremisa />
        {/* Modules, sefirot, marquee, CTA, footer land in later tasks. */}
```

- [ ] **Step 3: Type-check + build**

```bash
cd frontend
npx tsc -b --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/InicioPremisa.tsx frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): InicioPremisa — condensed manifiesto"
```

---

## Task 6: `InicioModulos` + wire

Three module cards in a grid. Each card has an inline mini-SVG visual on top, title, body, and a "EXPLORAR →" link.

**Files:**
- Create: `frontend/src/inicio/components/InicioModulos.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Create `InicioModulos.tsx`**

```tsx
import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

type ModuleCard = {
  title: string;
  body: string;
  art: React.ReactNode;
};

const GOLD = '#e9c349';

const MODULES: ModuleCard[] = [
  {
    title: 'Espejo Cognitivo',
    body:
      'Reflexión guiada por preguntas, una sefirá a la vez. La IA observa lo que escribís y devuelve un score de coherencia para que veas cómo se mueve cada dimensión.',
    art: (
      <svg viewBox="0 0 160 90" className="w-full h-full">
        <circle cx={80} cy={45} r={18} fill={`${GOLD}55`} />
        <circle cx={80} cy={45} r={10} fill={GOLD} />
        <circle cx={30} cy={20} r={2.5} fill={GOLD} opacity={0.7} />
        <circle cx={130} cy={20} r={2.5} fill={GOLD} opacity={0.7} />
        <circle cx={130} cy={70} r={2.5} fill={GOLD} opacity={0.7} />
        <line x1={30} y1={20} x2={80} y2={45} stroke={GOLD} strokeOpacity={0.4} strokeWidth={0.8} />
        <line x1={130} y1={20} x2={80} y2={45} stroke={GOLD} strokeOpacity={0.4} strokeWidth={0.8} />
        <line x1={130} y1={70} x2={80} y2={45} stroke={GOLD} strokeOpacity={0.4} strokeWidth={0.8} />
      </svg>
    ),
  },
  {
    title: 'Calendario Cabalístico',
    body:
      'Mapeá tus actividades semanales a las dimensiones del alma. Mirá el volumen energético de cada sefirá durante la semana, y dónde estás concentrando tu trabajo.',
    art: (
      <svg viewBox="0 0 160 90" className="w-full h-full">
        {[0, 1, 2, 3].map((row) =>
          [0, 1, 2, 3, 4, 5, 6].map((col) => {
            const x = 18 + col * 18;
            const y = 12 + row * 18;
            const isHighlight = row === 1 && col === 3;
            return (
              <rect
                key={`${row}-${col}`}
                x={x}
                y={y}
                width={12}
                height={12}
                rx={2}
                fill={isHighlight ? GOLD : `${GOLD}25`}
                stroke={isHighlight ? GOLD : `${GOLD}30`}
                strokeWidth={0.6}
              />
            );
          })
        )}
      </svg>
    ),
  },
  {
    title: 'Mi Evolución',
    body:
      'Curvas mensuales por sefirá: cómo te movés en el tiempo. Score IA y score propio lado a lado, para que veas la distancia entre lo que percibís y lo que el sistema lee.',
    art: (
      <svg viewBox="0 0 160 90" className="w-full h-full">
        <polyline
          points="14,72 38,60 60,64 84,40 108,46 130,22 148,28"
          fill="none"
          stroke={GOLD}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {[
          [14, 72], [38, 60], [60, 64], [84, 40], [108, 46], [130, 22], [148, 28],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={2} fill={GOLD} />
        ))}
        <line x1={10} y1={80} x2={150} y2={80} stroke={`${GOLD}30`} strokeWidth={0.5} />
      </svg>
    ),
  },
];

export default function InicioModulos() {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: reduced ? 0 : 28 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 28 }}
      transition={{ duration: 1, ease }}
      className="relative max-w-[1200px] mx-auto px-6 py-24 md:py-32"
    >
      <div className="text-center mb-14">
        <div className="ks-eyebrow mb-4">Módulos</div>
        <h2 className="ks-serif text-3xl md:text-5xl italic text-ink-glow tracking-tight">
          Tres dimensiones del trabajo.
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {MODULES.map((m) => (
          <div key={m.title} className="ks-module-card">
            <div className="aspect-[16/9] bg-[#0a0a0c] relative">
              <div className="absolute inset-0 flex items-center justify-center px-6">
                {m.art}
              </div>
            </div>
            <div className="p-6">
              <h3 className="ks-serif text-xl text-ink-glow mb-3">{m.title}</h3>
              <p className="ks-body text-sm mb-5">{m.body}</p>
              <span className="ks-eyebrow text-gold">Explorar →</span>
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 2: Wire into `InicioModule`**

Add the import:

```tsx
import InicioModulos from './components/InicioModulos';
```

Replace the comment block:

```tsx
        <InicioHero onEnterEspejo={onEnterEspejo} />
        <InicioPremisa />
        {/* Modules, sefirot, marquee, CTA, footer land in later tasks. */}
```

with:

```tsx
        <InicioHero onEnterEspejo={onEnterEspejo} />
        <InicioPremisa />
        <InicioModulos />
        {/* Sefirot, marquee, CTA, footer land in later tasks. */}
```

- [ ] **Step 3: Type-check + build**

```bash
cd frontend
npx tsc -b --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/InicioModulos.tsx frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): InicioModulos — three product cards with mini-SVG visuals"
```

---

## Task 7: `InicioSefirot` + wire

**Files:**
- Create: `frontend/src/inicio/components/InicioSefirot.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Create `InicioSefirot.tsx`**

```tsx
import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { SEFIRA_COLORS } from '../../shared/tokens';

const ease = [0.16, 1, 0.3, 1] as const;

type SefiraInfo = {
  id: string;
  nombre: string;
  hebreo: string;
  blurb: string;
};

const SEFIROT: SefiraInfo[] = [
  { id: 'keter',   nombre: 'Kéter',   hebreo: 'כתר',  blurb: 'La corona — voluntad pura, fuente.' },
  { id: 'jojma',   nombre: 'Jojmá',   hebreo: 'חכמה', blurb: 'Sabiduría — destello inicial.' },
  { id: 'bina',    nombre: 'Biná',    hebreo: 'בינה', blurb: 'Entendimiento — vasija que da forma.' },
  { id: 'jesed',   nombre: 'Jésed',   hebreo: 'חסד',  blurb: 'Misericordia — amor incondicional.' },
  { id: 'gevura',  nombre: 'Gueburá', hebreo: 'גבורה', blurb: 'Severidad — rigor, juicio.' },
  { id: 'tiferet', nombre: 'Tiféret', hebreo: 'תפארת', blurb: 'Belleza — equilibrio del centro.' },
  { id: 'netzaj',  nombre: 'Nétsaj',  hebreo: 'נצח',  blurb: 'Victoria — perseverancia.' },
  { id: 'hod',     nombre: 'Hod',     hebreo: 'הוד',  blurb: 'Esplendor — intelecto práctico.' },
  { id: 'yesod',   nombre: 'Yesod',   hebreo: 'יסוד', blurb: 'Fundamento — imaginación, psiquis.' },
  { id: 'maljut',  nombre: 'Maljut',  hebreo: 'מלכות', blurb: 'Reino — el mundo material.' },
];

export default function InicioSefirot() {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();

  return (
    <motion.section
      ref={ref}
      id="sefirot"
      initial={{ opacity: 0, y: reduced ? 0 : 28 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 28 }}
      transition={{ duration: 1, ease }}
      className="relative max-w-[1200px] mx-auto px-6 py-24 md:py-32"
    >
      <div className="text-center mb-14">
        <div className="ks-eyebrow mb-4">El árbol</div>
        <h2 className="ks-serif text-3xl md:text-5xl italic text-ink-glow tracking-tight">
          Diez dimensiones del alma.
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {SEFIROT.map((s) => {
          const color = SEFIRA_COLORS[s.id] ?? '#e9c349';
          return (
            <div key={s.id} className="ks-sef-card">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: color, boxShadow: `0 0 8px ${color}88` }}
                />
                <span className="ks-serif text-base text-ink-glow">{s.nombre}</span>
                <span className="ks-serif text-xs text-gold/60 ml-auto" lang="he" dir="rtl">
                  {s.hebreo}
                </span>
              </div>
              <p className="ks-body text-xs leading-snug">{s.blurb}</p>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 2: Wire into `InicioModule`**

Add the import:

```tsx
import InicioSefirot from './components/InicioSefirot';
```

Replace the comment block:

```tsx
        <InicioModulos />
        {/* Sefirot, marquee, CTA, footer land in later tasks. */}
```

with:

```tsx
        <InicioModulos />
        <InicioSefirot />
        {/* Marquee, CTA, footer land in later tasks. */}
```

- [ ] **Step 3: Type-check + build**

```bash
cd frontend
npx tsc -b --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/inicio/components/InicioSefirot.tsx frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): InicioSefirot — 10 sefirá cards grid with colour dots"
```

---

## Task 8: `InicioMarquee` + `InicioCtaFinal` + `InicioFooter` + wire

Three small components bundled — marquee strip, final CTA, footer. Then wire all three into `InicioModule`.

**Files:**
- Create: `frontend/src/inicio/components/InicioMarquee.tsx`
- Create: `frontend/src/inicio/components/InicioCtaFinal.tsx`
- Create: `frontend/src/inicio/components/InicioFooter.tsx`
- Modify: `frontend/src/inicio/InicioModule.tsx`

- [ ] **Step 1: Create `InicioMarquee.tsx`**

```tsx
const PHRASE = 'El conocimiento del universo empieza por adentro';

/**
 * Marquee strip — a horizontal band with the manifiesto's central phrase
 * repeated and scrolling left, driven by the ksMarquee keyframe (60s linear
 * infinite). prefers-reduced-motion disables the animation via a media
 * query on the keyframe class itself.
 */
export default function InicioMarquee() {
  // Two copies of the same content so the translateX -50% loops seamlessly.
  return (
    <section className="relative bg-gold/[0.07] border-y border-line py-6 overflow-hidden">
      <div className="ks-marquee flex gap-12 whitespace-nowrap">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 gap-12 items-center">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="flex items-center gap-12 shrink-0">
                <span className="ks-serif text-2xl italic text-gold/80">{PHRASE}</span>
                <span className="text-gold/60 text-xl">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create `InicioCtaFinal.tsx`**

```tsx
import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Final CTA section — repeats the hero buttons after the marquee, giving
 * scrollers a second commit point. Uses useInView so the section fades up
 * when it enters the viewport.
 */
export default function InicioCtaFinal({ onEnterEspejo }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: reduced ? 0 : 28 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 28 }}
      transition={{ duration: 1, ease }}
      className="relative max-w-3xl mx-auto px-6 py-24 md:py-32 text-center"
    >
      <div className="ks-eyebrow mb-6">Comenzá</div>
      <h2 className="ks-serif text-4xl md:text-6xl italic text-ink-glow tracking-tight mb-10 leading-tight">
        Tu árbol te espera.
      </h2>
      <div className="flex flex-col md:flex-row items-center justify-center gap-4">
        <button type="button" onClick={onEnterEspejo} className="ks-btn-primary">
          Entrar al Árbol
          <span aria-hidden>→</span>
        </button>
        <a href="#premisa" className="ks-btn-ghost">
          Releer la premisa
        </a>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 3: Create `InicioFooter.tsx`**

```tsx
import KabbalahLogo from './KabbalahLogo';

/**
 * Bottom footer for the landing — small logo, copyright, quick links.
 * No reveal animation; the footer is decorative closure and benefits from
 * being visible immediately when the user scrolls to the bottom.
 */
export default function InicioFooter() {
  return (
    <footer className="relative border-t border-line py-10 text-center">
      <div className="max-w-3xl mx-auto px-6 flex flex-col items-center gap-5">
        <KabbalahLogo size="sm" />
        <p className="ks-eyebrow">
          Kabbalah Space © 2026 · Hecho con <span className="text-gold">✦</span>
        </p>
        <nav className="flex items-center gap-4">
          <a href="#premisa" className="ks-nav-link">Manifiesto</a>
          <a href="#sefirot" className="ks-nav-link">Sefirot</a>
          <a
            href="https://github.com/zAlexander19/kabbalah-space"
            target="_blank"
            rel="noopener noreferrer"
            className="ks-nav-link"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Wire all three into `InicioModule`**

Add the imports right after `InicioSefirot`:

```tsx
import InicioMarquee from './components/InicioMarquee';
import InicioCtaFinal from './components/InicioCtaFinal';
import InicioFooter from './components/InicioFooter';
```

Replace the comment block:

```tsx
        <InicioSefirot />
        {/* Marquee, CTA, footer land in later tasks. */}
```

with:

```tsx
        <InicioSefirot />
        <InicioMarquee />
        <InicioCtaFinal onEnterEspejo={onEnterEspejo} />
        <InicioFooter />
```

- [ ] **Step 5: Type-check + build**

```bash
cd frontend
npx tsc -b --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/inicio/components/InicioMarquee.tsx frontend/src/inicio/components/InicioCtaFinal.tsx frontend/src/inicio/components/InicioFooter.tsx frontend/src/inicio/InicioModule.tsx
git commit -m "feat(inicio): InicioMarquee + InicioCtaFinal + InicioFooter (closing sections)"
```

---

## Task 9: Manual verification + push + open PR

- [ ] **Step 1: Final type-check + lint + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run lint
npm run build
```

Expected: tsc clean. Lint may show 2 pre-existing warnings in `SefiraDetailPanel.tsx`. Build clean (bundle size around ~490–500 KB, ~145 KB gzip).

- [ ] **Step 2: Boot servers**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\backend"
./venv/Scripts/python.exe -m uvicorn main:app --reload
# in another terminal
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npm run dev
```

- [ ] **Step 3: Manual scenario matrix**

Open http://localhost:5173 in a **fresh tab** (sessionStorage empty).

- [ ] **A — Loading screen fires:** counter 000→100, words cycling, amber progress bar.
- [ ] **B — Landing appears:** nav at top, hero centered, pill "ALEPH 1", title "Kabbalah Space" big italic serif, tagline "Inteligencia del Ser.", body copy, two CTAs ("Entrar al Árbol" primary gold, "Cómo funciona" ghost), scroll indicator at the bottom.
- [ ] **C — Nav behaviour:** scroll past 100px → nav gets stronger backdrop-blur + border. Anonymous: CTA shows "Iniciar sesión ↗". Authenticated: CTA shows "Entrar al Árbol ↗".
- [ ] **D — Anchor links:** click "Manifiesto" in the nav → smooth scroll to the premisa section. Click "Sefirot" → smooth scroll to the sefirot grid.
- [ ] **E — Premisa section** reveals on scroll with fade-up, two condensed paragraphs.
- [ ] **F — Modules section:** three cards (Espejo Cognitivo / Calendario Cabalístico / Mi Evolución), each with a different mini-SVG visual on top. Hover each card → gold border + lift.
- [ ] **G — Sefirot grid:** 10 cards in a 5×2 grid on desktop (2×5 on mobile). Each card shows a coloured dot using `SEFIRA_COLORS`, Spanish name, Hebrew name on the right, one-line description.
- [ ] **H — Marquee strip:** "El conocimiento del universo empieza por adentro ✦ " loops horizontally, scrolling left.
- [ ] **I — Final CTA:** "Tu árbol te espera." with the two buttons. Click primary → goes to the Espejo (intro plays if first time).
- [ ] **J — Footer:** logo, copyright, three quick links. GitHub opens in new tab.
- [ ] **K — Mobile (430 px viewport via DevTools):** nav links hide, only logo + CTA remain. Modules grid collapses to 1 column. Sefirot grid collapses to 2 columns. Marquee keeps running.
- [ ] **L — `prefers-reduced-motion: reduce` in DevTools → Rendering:** hero animations are instant, section reveals are simple fade (no y translate), marquee stops, scroll indicator no longer flows.
- [ ] **M — Logo on dark:** Kabbalah ✦ Space wordmark + mini tree icon read clearly. No invisible navy text.

If any scenario fails, stop and report rather than committing further.

- [ ] **Step 4: Stop both dev servers (Ctrl+C in each terminal).**

- [ ] **Step 5: Verify commit log**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space"
git log --oneline origin/main..HEAD
```

Expected: ~9 commits on `feat/inicio-landing` (spec cherry-pick + plan + 7 task commits + this manual sweep commit if any).

- [ ] **Step 6: Push the new branch**

```bash
git push -u origin feat/inicio-landing
```

- [ ] **Step 7: Open the PR**

```bash
gh pr create --title "feat(inicio): marketing landing redesign" --body "$(cat <<'EOF'
## Summary

Replaces the contemplative manifiesto (PR #40, closed without merging) with a marketing-style landing page based on the gold-on-dark CSS framework the user provided.

### Sections

1. **Nav** — fixed top, inline logo (mini tree + "Kabbalah ✦ Space" wordmark adapted for dark), anchor links + auth-aware CTA.
2. **Hero** — full-viewport intro: pill, big italic name, tagline, body copy, two CTAs, scroll indicator.
3. **Premisa** — condensed manifiesto (two short paragraphs).
4. **Módulos** — three product cards (Espejo Cognitivo / Calendario Cabalístico / Mi Evolución) with inline mini-SVG visuals.
5. **Sefirot** — 10 cards grid, one per sefirá, with colour dots from `SEFIRA_COLORS` + Hebrew + Spanish names.
6. **Marquee** — horizontal strip with the manifesto's central phrase loopeada.
7. **CTA final** — "Tu árbol te espera." with the same two buttons as the hero.
8. **Footer** — logo, copyright, quick links (Manifiesto / Sefirot / GitHub).

### Preserved from the previous enhance

- `LoadingScreen` (000→100 counter, rotating words, amber progress bar).
- `CosmicBackground` (radial gradient + 80 flickering stars + colour patches).
- Instrument Serif italic registered in the Tailwind 4 `@theme`.
- `prefers-reduced-motion` respected throughout.

### CSS framework

The `.ks-*` utility classes from the user's HTML template are registered as global utilities in `frontend/src/index.css`, alongside new `@theme` color tokens (`bg-deep`, `surface-1`, `ink`, `ink-glow`, `gold`, `gold-deep`, `line`). Keyframes (`ksScrollDown`, `ksBlurIn`, `ksName-reveal`, `ksMarquee`) live in the same file.

### Test plan

- [x] `tsc -b --noEmit` clean
- [x] `vite build` clean
- [x] Manual: loading → hero → scroll through all sections → anchor links → CTAs → mobile viewport → reduced-motion. All pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Note the PR URL** for the user to review and merge when ready.

---

## Done

After PR merges (squash), the marketing landing ships to `main` as a single commit. The contemplative manifiesto from PR #40 stays in the github history under `feat/inicio-manifiesto` for future reference.
