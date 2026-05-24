# Sistema Premium — Plan 3: Frontend UI Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el frontend del sistema premium — página `/premium`, modal reusable `<PremiumGate>`, interceptor global de 402, paywall post-escritura en reflexión libre, vista "Mi cuenta → Suscripción", y UI gating en `ActivityForm` (límite de 10 + recurrencias). Al terminar, el usuario puede registrarse, hacerse premium, y ver el flujo completo desde el browser.

**Architecture:** Módulo nuevo `frontend/src/premium/` autónomo. Estado de tier via hook `usePremium` (consume `GET /billing/status`). Context `PremiumGateContext` para abrir el modal desde cualquier lugar. Interceptor de 402 en `apiFetch` que dispara `openGate(reason)` automáticamente. Vistas nuevas `'premium'` y `'cuenta'` agregadas al `ViewKey` existente en `App.tsx`. Sin react-router — routing manual como el resto del codebase.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind 4 + Framer Motion. Sin tests automatizados (no hay framework configurado) — verificación por **TypeScript compile** (`tsc -b`) + **build OK** (`npm run build`) + **smoke test manual** en browser con backend corriendo.

**Plan 3 de 3.** Plan 1 (core backend) está shipped. Plan 2 (emails) es independiente, puede hacerse antes o después. Este plan no depende de Plan 2.

**Spec de referencia:** [docs/superpowers/specs/2026-05-21-sistema-premium-design.md](../specs/2026-05-21-sistema-premium-design.md) — sección 9 (UI premium) y 7 (gating).

**Backend endpoints disponibles (Plan 1):**
- `GET /billing/status` → `{tier: "free"|"premium", subscription: {...}|null}`
- `POST /billing/checkout` → `{checkout_url}` (redirige a Lemonsqueezy)
- `GET /billing/portal` → `{portal_url}` (redirige al customer portal)
- `POST /reflexiones-libres` → 201 con la reflexión creada, o 402 con `reason: "free_reflection_limit"`
- Gates en endpoints existentes responden 402 con `{error: "premium_required", reason: "actividad_limit"|"recurrence_premium"|"historico_premium"|"feature_premium_only", current?, max?}`
- Gate de cooldown en `/respuestas` responde 409 con `{error: "cooldown_active", reason: "respuesta_cooldown", next_available}`

---

## File Structure

### Archivos nuevos
- `frontend/src/premium/types.ts` — tipos compartidos (BillingStatus, GateReason, etc.)
- `frontend/src/premium/api.ts` — funciones API (status, checkout, portal, reflexión libre)
- `frontend/src/premium/usePremium.ts` — hook que fetcha `/billing/status`
- `frontend/src/premium/PremiumGateContext.tsx` — provider + `useGate()` hook
- `frontend/src/premium/PremiumGate.tsx` — modal reusable
- `frontend/src/premium/gateCopy.ts` — mensajes contextuales por `reason`
- `frontend/src/premium/PricingToggle.tsx` — toggle mensual/anual
- `frontend/src/premium/ComparisonTable.tsx` — tabla free vs premium
- `frontend/src/premium/PremiumPage.tsx` — página `/premium` completa
- `frontend/src/premium/PromoBanner.tsx` — banner cuando `?promo=` en URL
- `frontend/src/premium/index.ts` — barrel export
- `frontend/src/cuenta/CuentaPage.tsx` — vista "Mi cuenta"
- `frontend/src/cuenta/SubscriptionSection.tsx` — sección de suscripción dentro de Mi Cuenta
- `frontend/src/espejo/ReflexionLibreEditor.tsx` — editor con paywall post-escritura

### Archivos modificados
- `frontend/src/auth/api.ts` — agregar `setPaymentRequiredHandler` + dispatch en `apiFetch`
- `frontend/src/App.tsx` — agregar `'premium'` y `'cuenta'` a ViewKey, registrar `<PremiumGateProvider>`, wire del 402 handler
- `frontend/src/auth/UserMenu.tsx` — agregar item "Mi cuenta" en el dropdown
- `frontend/src/inicio/components/InicioNav.tsx` — agregar entry "Premium" (opcional según diseño)
- `frontend/src/espejo/EspejoModule.tsx` — entry point al editor de reflexión libre
- `frontend/src/calendar/ActivityForm.tsx` — disable recurrencias si free + lectura del límite

### NOT en este plan
- Toggles de preferencias de email (parte de Plan 2)
- Configuración de Resend / Lemonsqueezy en cuentas reales (operativo)

---

## Task 1: Tipos y API client

**Files:**
- Create: `frontend/src/premium/types.ts`
- Create: `frontend/src/premium/api.ts`
- Create: `frontend/src/premium/index.ts`

- [ ] **Step 1: Crear `types.ts`**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\premium\types.ts`:

```typescript
/**
 * Shared types for the premium / billing module.
 *
 * GateReason values must match the backend `reason` field in 402 responses.
 * Keep this in sync with backend/billing/dependencies.py + main.py gating sites.
 */

export type Tier = 'free' | 'premium';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | 'expired';

export type SubscriptionPlan = 'monthly' | 'yearly';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  current_period_end: string; // ISO 8601
  trial_ends_at: string | null;
  canceled_at: string | null;
}

export interface BillingStatus {
  tier: Tier;
  subscription: SubscriptionInfo | null;
}

/**
 * The `reason` field of a 402 response from the backend. The PremiumGate modal
 * uses this to pick the right contextual copy.
 *
 * NOTE: 'respuesta_cooldown' is a 409 (cooldown_active), not a 402. The modal
 * shows it for friendliness but it's a different status code.
 */
export type GateReason =
  | 'actividad_limit'
  | 'recurrence_premium'
  | 'historico_premium'
  | 'free_reflection_limit'
  | 'feature_premium_only'
  | 'respuesta_cooldown';

export interface GateError {
  error: 'premium_required' | 'cooldown_active';
  reason: GateReason;
  current?: number;
  max?: number;
  next_available?: string;
}

export interface CheckoutRequest {
  plan: SubscriptionPlan;
  promo_code?: string;
}

export interface CheckoutResponse {
  checkout_url: string;
}

export interface ReflexionLibreCreate {
  tipo: 'sefira' | 'arbol';
  sefira_id?: string;
  contenido: string;
}

export interface ReflexionLibreOut {
  id: string;
  tipo: 'sefira' | 'arbol';
  sefira_id: string | null;
  contenido: string;
  fecha_creacion: string; // ISO 8601
}
```

- [ ] **Step 2: Crear `api.ts`**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\premium\api.ts`:

```typescript
import { apiFetch } from '../auth/api';
import type {
  BillingStatus,
  CheckoutRequest,
  CheckoutResponse,
  ReflexionLibreCreate,
  ReflexionLibreOut,
} from './types';

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === 'string') return body.detail;
    if (body.detail && typeof body.detail.reason === 'string') return body.detail.reason;
  } catch {
    /* fall through */
  }
  return `HTTP ${res.status}`;
}

export async function getBillingStatus(): Promise<BillingStatus> {
  const res = await apiFetch('/billing/status');
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createCheckout(payload: CheckoutRequest): Promise<CheckoutResponse> {
  const res = await apiFetch('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getPortalUrl(): Promise<string> {
  const res = await apiFetch('/billing/portal');
  if (!res.ok) throw new Error(await parseError(res));
  const body = await res.json();
  return body.portal_url;
}

export async function createReflexionLibre(
  payload: ReflexionLibreCreate,
): Promise<ReflexionLibreOut> {
  const res = await apiFetch('/reflexiones-libres', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
```

- [ ] **Step 3: Crear `index.ts` barrel**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\premium\index.ts`:

```typescript
export type {
  Tier,
  SubscriptionStatus,
  SubscriptionPlan,
  SubscriptionInfo,
  BillingStatus,
  GateReason,
  GateError,
  CheckoutRequest,
  CheckoutResponse,
  ReflexionLibreCreate,
  ReflexionLibreOut,
} from './types';

export {
  getBillingStatus,
  createCheckout,
  getPortalUrl,
  createReflexionLibre,
} from './api';
```

- [ ] **Step 4: Verificar TypeScript compila**

Run from `frontend/`:
```bash
npx tsc -b
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/premium/types.ts frontend/src/premium/api.ts frontend/src/premium/index.ts
git commit -m "feat(premium-ui): types + api client (status, checkout, portal, reflexion libre)"
```

---

## Task 2: `usePremium` hook

**Files:**
- Create: `frontend/src/premium/usePremium.ts`

- [ ] **Step 1: Crear el hook**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\premium\usePremium.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import { getBillingStatus } from './api';
import type { BillingStatus } from './types';

interface UsePremiumResult {
  status: BillingStatus | null;
  loading: boolean;
  error: string | null;
  isPremium: boolean;
  refetch: () => Promise<void>;
}

/**
 * Reads the current user's billing status from /billing/status.
 *
 * - Anonymous users: returns `{tier: 'free', subscription: null}` synthesized
 *   locally (no API call).
 * - Authenticated users: fetches on mount, then again whenever auth state changes.
 * - Exposes `refetch()` so callers can re-read after a known state change
 *   (e.g., after returning from checkout).
 */
export function usePremium(): UsePremiumResult {
  const auth = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      setStatus({ tier: 'free', subscription: null });
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getBillingStatus();
      if (mountedRef.current) {
        setStatus(result);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'unknown');
        // Fail safe: treat error as free so the user is not blocked from anything.
        setStatus({ tier: 'free', subscription: null });
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [auth.status]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    isPremium: status?.tier === 'premium',
    refetch: fetchStatus,
  };
}
```

- [ ] **Step 2: Verificar TS compila**

```bash
cd frontend
npx tsc -b
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/premium/usePremium.ts
git commit -m "feat(premium-ui): hook usePremium para leer /billing/status"
```

---

## Task 3: `PremiumGateContext` + `useGate` hook

**Files:**
- Create: `frontend/src/premium/PremiumGateContext.tsx`

- [ ] **Step 1: Crear el context**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\premium\PremiumGateContext.tsx`:

```typescript
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import type { GateError, GateReason } from './types';

interface OpenGateOptions {
  reason: GateReason;
  detail?: GateError;
}

interface PremiumGateContextValue {
  isOpen: boolean;
  reason: GateReason | null;
  detail: GateError | null;
  openGate: (options: OpenGateOptions) => void;
  closeGate: () => void;
}

const PremiumGateContext = createContext<PremiumGateContextValue | null>(null);

export function PremiumGateProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<GateReason | null>(null);
  const [detail, setDetail] = useState<GateError | null>(null);

  const openGate = useCallback((options: OpenGateOptions) => {
    setReason(options.reason);
    setDetail(options.detail ?? null);
    setIsOpen(true);
  }, []);

  const closeGate = useCallback(() => {
    setIsOpen(false);
    // Keep reason/detail until next open so exit animation can read them.
  }, []);

  return (
    <PremiumGateContext.Provider value={{ isOpen, reason, detail, openGate, closeGate }}>
      {children}
    </PremiumGateContext.Provider>
  );
}

export function useGate(): PremiumGateContextValue {
  const ctx = useContext(PremiumGateContext);
  if (ctx === null) {
    throw new Error('useGate must be used inside <PremiumGateProvider>');
  }
  return ctx;
}
```

- [ ] **Step 2: TS check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/premium/PremiumGateContext.tsx
git commit -m "feat(premium-ui): PremiumGateContext con openGate/closeGate"
```

---

## Task 4: Copy contextual por reason + componente `PremiumGate`

**Files:**
- Create: `frontend/src/premium/gateCopy.ts`
- Create: `frontend/src/premium/PremiumGate.tsx`

- [ ] **Step 1: Crear `gateCopy.ts`**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\premium\gateCopy.ts`:

```typescript
import type { GateReason, GateError } from './types';

interface GateCopy {
  title: string;
  description: (detail: GateError | null) => string;
}

/**
 * Per-reason copy for the PremiumGate modal. Spanish, sin tono marketinero —
 * acorde a Templo Digital design language.
 */
export const GATE_COPY: Record<GateReason, GateCopy> = {
  actividad_limit: {
    title: 'Alcanzaste el límite del calendario',
    description: (detail) => {
      const max = detail?.max ?? 10;
      return `Las cuentas gratuitas pueden mantener hasta ${max} actividades activas. Premium las libera sin tope.`;
    },
  },
  recurrence_premium: {
    title: 'Las actividades recurrentes son Premium',
    description: () =>
      'Configurá ciclos repetidos (lunes a viernes, semanal, mensual) con la suscripción Premium.',
  },
  historico_premium: {
    title: 'Histórico extendido en Premium',
    description: () =>
      'Tu cuenta gratuita ve los últimos 12 meses de evolución. Premium libera el historial completo.',
  },
  free_reflection_limit: {
    title: 'Ya hiciste tu reflexión libre del mes',
    description: () =>
      'Las cuentas gratuitas pueden escribir una reflexión libre por mes. Premium te da reflexión sin límite.',
  },
  feature_premium_only: {
    title: 'Función exclusiva de Premium',
    description: () => 'Esta capacidad está disponible solo en cuentas Premium.',
  },
  respuesta_cooldown: {
    title: 'Esta pregunta vuelve más adelante',
    description: (detail) => {
      const date = detail?.next_available;
      return date
        ? `Volvé a responder esta pregunta el ${date}. Premium reduce el cooldown de 30 a 7 días.`
        : 'Premium reduce el cooldown de 30 a 7 días.';
    },
  },
};

export const PREMIUM_HIGHLIGHTS = [
  'Reflexión libre sin límite',
  'Calendario sin tope + recurrencias',
  'Análisis profundo con IA en cada reflexión',
  'Resumen semanal por correo',
];
```

- [ ] **Step 2: Crear `PremiumGate.tsx`**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\premium\PremiumGate.tsx`:

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';

import { useGate } from './PremiumGateContext';
import { GATE_COPY, PREMIUM_HIGHLIGHTS } from './gateCopy';

const ease = [0.16, 1, 0.3, 1] as const;

interface PremiumGateProps {
  /** Called when the user clicks "Ver planes". The caller decides routing. */
  onNavigateToPremium: () => void;
}

export function PremiumGate({ onNavigateToPremium }: PremiumGateProps) {
  const { isOpen, reason, detail, closeGate } = useGate();

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeGate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeGate]);

  const copy = reason ? GATE_COPY[reason] : null;

  return (
    <AnimatePresence>
      {isOpen && copy && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeGate}
            aria-hidden="true"
          />

          <motion.div
            key="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="premium-gate-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease }}
            className="relative w-full max-w-md rounded-2xl bg-stone-950/95 border border-amber-300/20 shadow-[0_24px_80px_rgba(0,0,0,0.6)] p-7"
          >
            <h2
              id="premium-gate-title"
              className="font-serif text-2xl text-amber-100/95 mb-3"
            >
              {copy.title}
            </h2>
            <p className="text-stone-300 text-sm leading-relaxed mb-5">
              {copy.description(detail)}
            </p>

            <div className="border-t border-stone-800/70 pt-4 mb-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-3">
                Con Premium tenés
              </p>
              <ul className="space-y-1.5">
                {PREMIUM_HIGHLIGHTS.map((h) => (
                  <li
                    key={h}
                    className="flex items-start gap-2 text-stone-200 text-sm"
                  >
                    <span
                      className="material-symbols-outlined text-amber-300/80 text-[16px] mt-0.5"
                      aria-hidden="true"
                    >
                      check
                    </span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeGate}
                className="px-4 py-2 rounded-full text-stone-400 hover:text-stone-200 text-xs tracking-wide transition-colors"
              >
                Ahora no
              </button>
              <button
                type="button"
                onClick={() => {
                  closeGate();
                  onNavigateToPremium();
                }}
                className="px-5 py-2 rounded-full bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/40 text-amber-100 text-xs tracking-wide transition-colors shadow-[0_0_12px_rgba(233,195,73,0.2)]"
              >
                Ver planes
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: TS check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/premium/gateCopy.ts frontend/src/premium/PremiumGate.tsx
git commit -m "feat(premium-ui): PremiumGate modal + copy por reason"
```

---

## Task 5: Interceptor de 402/409 en `apiFetch`

**Files:**
- Modify: `frontend/src/auth/api.ts`

- [ ] **Step 1: Agregar handler registration**

Edit `c:\Users\123\Desktop\Kabbalah Space\frontend\src\auth\api.ts`. After the `setUnauthorizedHandler` block (around line 31), add:

```typescript
// ---------- 402 / 409 (premium gating) interceptor ----------

import type { GateError } from '../premium/types';

let onPaymentRequired: ((err: GateError) => void) | null = null;

export function setPaymentRequiredHandler(fn: (err: GateError) => void): void {
  onPaymentRequired = fn;
}
```

(Place the `import` at the top of the file with the other imports, not in the middle. Move it after `import type { User } from './types';`.)

- [ ] **Step 2: Dispatch on 402/409 in `apiFetch`**

In the same file, modify `apiFetch` (around lines 43-56). The current code:

```typescript
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && token) {
    setStoredToken(null);
    onUnauthorized?.();
  }
  return res;
}
```

Replace with:

```typescript
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && token) {
    setStoredToken(null);
    onUnauthorized?.();
  }
  if ((res.status === 402 || res.status === 409) && onPaymentRequired) {
    // Clone before reading so the original response body is still consumable by the caller.
    try {
      const cloned = res.clone();
      const body = await cloned.json();
      if (body?.detail?.reason) {
        onPaymentRequired(body.detail as GateError);
      }
    } catch {
      /* malformed body — don't crash the interceptor */
    }
  }
  return res;
}
```

- [ ] **Step 3: TS check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/auth/api.ts
git commit -m "feat(premium-ui): interceptor de 402/409 en apiFetch dispara gate handler"
```

---

## Task 6: Componentes `PricingToggle` y `ComparisonTable`

**Files:**
- Create: `frontend/src/premium/PricingToggle.tsx`
- Create: `frontend/src/premium/ComparisonTable.tsx`

- [ ] **Step 1: Crear `PricingToggle.tsx`**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\premium\PricingToggle.tsx`:

```typescript
import type { SubscriptionPlan } from './types';

interface PricingToggleProps {
  selected: SubscriptionPlan;
  onChange: (plan: SubscriptionPlan) => void;
}

const PRICES: Record<SubscriptionPlan, { amount: string; cadence: string; savings?: string }> = {
  monthly: { amount: 'USD 6.58', cadence: 'por mes' },
  yearly: { amount: 'USD 65.80', cadence: 'por año', savings: 'ahorrás 2 meses' },
};

export function PricingToggle({ selected, onChange }: PricingToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-full bg-stone-900/80 border border-stone-800/70">
      {(['monthly', 'yearly'] as const).map((plan) => {
        const active = selected === plan;
        const price = PRICES[plan];
        return (
          <button
            key={plan}
            type="button"
            onClick={() => onChange(plan)}
            aria-pressed={active}
            className={`relative px-5 py-2 rounded-full text-xs tracking-wide transition-colors ${
              active
                ? 'bg-amber-300/15 text-amber-100 border border-amber-300/40 shadow-[0_0_12px_rgba(233,195,73,0.15)]'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <span className="font-medium">{plan === 'monthly' ? 'Mensual' : 'Anual'}</span>
            <span className="ml-2 text-[10px] text-stone-500">{price.amount}</span>
            {plan === 'yearly' && (
              <span className="absolute -top-2 right-1 text-[9px] uppercase tracking-[0.14em] text-amber-300/80 bg-stone-950 px-2 py-0.5 rounded-full border border-amber-300/30">
                -2 meses
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Crear `ComparisonTable.tsx`**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\premium\ComparisonTable.tsx`:

```typescript
interface Row {
  label: string;
  free: string;
  premium: string;
}

const ROWS: Row[] = [
  { label: 'Preguntas guía del Espejo', free: 'Sin límite, cooldown 30 días', premium: 'Sin límite, cooldown 7 días' },
  { label: 'Reflexión libre por sefirá o árbol', free: '1 por mes', premium: 'Sin límite' },
  { label: 'Actividades en el calendario', free: 'Hasta 10 activas', premium: 'Sin límite' },
  { label: 'Actividades recurrentes (RRULE)', free: '—', premium: 'Incluidas' },
  { label: 'Histórico en Mi Evolución', free: 'Últimos 12 meses', premium: 'Sin límite' },
  { label: 'Google Calendar sync', free: 'Incluido', premium: 'Incluido' },
  { label: 'Análisis IA personalizado en reflexiones', free: '—', premium: 'Incluido' },
  { label: 'Resumen semanal por correo', free: '—', premium: 'Incluido' },
  { label: 'Alertas y recordatorios contextuales', free: '—', premium: 'Incluidos' },
];

export function ComparisonTable() {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="text-left text-[10px] uppercase tracking-[0.2em] text-stone-500 pb-3 pr-4">
              Capacidad
            </th>
            <th className="text-center text-xs text-stone-400 pb-3 px-4 border-l border-stone-800/70">
              Free
            </th>
            <th className="text-center text-xs text-amber-100 pb-3 px-4 border-l border-amber-300/20">
              Premium
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => (
            <tr key={row.label} className={i % 2 === 0 ? 'bg-stone-950/40' : ''}>
              <td className="text-sm text-stone-200 py-3 pr-4">{row.label}</td>
              <td className="text-center text-sm text-stone-400 py-3 px-4 border-l border-stone-800/40">
                {row.free}
              </td>
              <td className="text-center text-sm text-amber-100/90 py-3 px-4 border-l border-amber-300/10">
                {row.premium}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: TS check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/premium/PricingToggle.tsx frontend/src/premium/ComparisonTable.tsx
git commit -m "feat(premium-ui): PricingToggle (mensual/anual) + ComparisonTable free vs premium"
```

---

## Task 7: `PromoBanner` y `PremiumPage`

**Files:**
- Create: `frontend/src/premium/PromoBanner.tsx`
- Create: `frontend/src/premium/PremiumPage.tsx`

- [ ] **Step 1: Crear `PromoBanner.tsx`**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\premium\PromoBanner.tsx`:

```typescript
import { useEffect, useState } from 'react';

/**
 * Reads a promo code from the URL `?promo=XYZ` query param and shows a banner.
 *
 * The actual validation happens server-side in /billing/checkout — this banner
 * is informational only. If the user submits and the code is invalid, they
 * see an error inline.
 */
export function usePromoFromUrl(): string | null {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const promo = params.get('promo');
    if (promo) setCode(promo.toUpperCase());
  }, []);

  return code;
}

interface PromoBannerProps {
  code: string;
}

export function PromoBanner({ code }: PromoBannerProps) {
  return (
    <div className="w-full rounded-2xl bg-amber-300/10 border border-amber-300/30 px-5 py-4 flex items-center gap-3">
      <span
        className="material-symbols-outlined text-amber-300 text-[20px]"
        aria-hidden="true"
      >
        local_offer
      </span>
      <div className="flex-1">
        <p className="text-amber-100 text-sm font-medium">
          7 días gratis con el código <span className="font-mono">{code}</span>
        </p>
        <p className="text-stone-300 text-xs mt-0.5">
          Al suscribirte se aplica automáticamente. Vas a poder cancelar antes de que termine el trial.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear `PremiumPage.tsx`**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\premium\PremiumPage.tsx`:

```typescript
import { useState } from 'react';
import { motion } from 'framer-motion';

import { useAuth } from '../auth/AuthContext';
import { createCheckout } from './api';
import { ComparisonTable } from './ComparisonTable';
import { PricingToggle } from './PricingToggle';
import { PromoBanner, usePromoFromUrl } from './PromoBanner';
import { usePremium } from './usePremium';
import type { SubscriptionPlan } from './types';

const ease = [0.16, 1, 0.3, 1] as const;

const FAQ = [
  {
    q: '¿Cómo cancelo?',
    a: 'Desde "Mi cuenta → Suscripción" hacés un click en "Gestionar suscripción" y cancelás cuando quieras. Mantenés el acceso hasta el final del período que pagaste.',
  },
  {
    q: '¿Qué pasa con mis datos si cancelo?',
    a: 'Tus reflexiones, actividades y evolución siguen siendo tuyas. Volvés al tier gratis con sus límites, pero no perdés nada de tu historia.',
  },
  {
    q: '¿Cuándo se cobra?',
    a: 'Si entraste con un código de 7 días gratis, el cobro empieza al octavo día (podés cancelar antes sin costo). Si no, el cobro es inmediato al suscribirte.',
  },
  {
    q: '¿Hay reembolsos?',
    a: 'No automáticos. Si tenés un caso especial, escribínos y lo revisamos a mano.',
  },
];

export function PremiumPage() {
  const auth = useAuth();
  const { isPremium } = usePremium();
  const promoCode = usePromoFromUrl();
  const [plan, setPlan] = useState<SubscriptionPlan>('yearly');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    if (auth.status !== 'authenticated') {
      auth.openLoginModal();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createCheckout({
        plan,
        promo_code: promoCode ?? undefined,
      });
      window.location.assign(result.checkout_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-10 md:py-14 space-y-12">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
        className="text-center space-y-4"
      >
        <h1 className="font-serif text-4xl md:text-5xl text-amber-100/95 leading-tight">
          Profundizá en vos.
        </h1>
        <p className="text-stone-300 text-base md:text-lg max-w-xl mx-auto">
          Acá están las herramientas. Para quienes ya saben que la cábala no se mira de afuera.
        </p>
      </motion.div>

      {promoCode && <PromoBanner code={promoCode} />}

      {/* Pricing + CTA */}
      <div className="bg-[#15181d] border border-stone-700/40 rounded-3xl p-6 md:p-10 space-y-6 shadow-2xl">
        <div className="flex flex-col items-center gap-5">
          <PricingToggle selected={plan} onChange={setPlan} />

          {isPremium ? (
            <p className="text-amber-100/90 text-sm">
              Ya tenés Premium activo. Gracias por estar acá.
            </p>
          ) : (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubscribe}
                className="px-8 py-3 rounded-full bg-amber-300/20 hover:bg-amber-300/30 border border-amber-300/50 text-amber-50 text-sm tracking-wide transition-colors shadow-[0_0_20px_rgba(233,195,73,0.25)] disabled:opacity-60 disabled:cursor-wait"
              >
                {submitting ? 'Abriendo checkout...' : 'Suscribirme a Premium'}
              </button>
              {error && (
                <p className="text-red-300 text-sm" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <div className="border-t border-stone-800/70 pt-6">
          <ComparisonTable />
        </div>
      </div>

      {/* FAQ */}
      <div className="space-y-4">
        <h2 className="font-serif text-2xl text-amber-100/90 text-center mb-6">
          Preguntas que tal vez tengas
        </h2>
        {FAQ.map((item) => (
          <details
            key={item.q}
            className="group bg-stone-950/60 border border-stone-800/60 rounded-xl px-5 py-4"
          >
            <summary className="cursor-pointer text-stone-200 text-sm font-medium list-none flex items-center justify-between">
              <span>{item.q}</span>
              <span
                className="material-symbols-outlined text-stone-500 text-[18px] transition-transform group-open:rotate-180"
                aria-hidden="true"
              >
                expand_more
              </span>
            </summary>
            <p className="mt-3 text-stone-400 text-sm leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: TS check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/premium/PromoBanner.tsx frontend/src/premium/PremiumPage.tsx
git commit -m "feat(premium-ui): PromoBanner + PremiumPage con hero, tabla, FAQ y CTA"
```

---

## Task 8: Integrar 'premium' en App.tsx + montar provider + wire 402 handler

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Agregar 'premium' al ViewKey**

Edit `c:\Users\123\Desktop\Kabbalah Space\frontend\src\App.tsx`.

Find:
```typescript
type ViewKey = 'inicio' | 'espejo' | 'admin' | 'calendario' | 'evolucion';
```

Replace with:
```typescript
type ViewKey = 'inicio' | 'espejo' | 'admin' | 'calendario' | 'evolucion' | 'premium' | 'cuenta';
```

Find the `VIEW_TITLES` const and add entries:
```typescript
  premium:    { title: 'Premium',                 subtitle: 'Profundizá tu práctica con las herramientas completas.' },
  cuenta:     { title: 'Mi cuenta',              subtitle: 'Suscripción, datos personales y preferencias.' },
```

- [ ] **Step 2: Import nuevos**

Near the top of `App.tsx`:

```typescript
import { PremiumGateProvider, useGate } from './premium/PremiumGateContext';
import { PremiumGate } from './premium/PremiumGate';
import { PremiumPage } from './premium/PremiumPage';
import { setPaymentRequiredHandler } from './auth/api';
```

(The `CuentaPage` import comes in a later task.)

- [ ] **Step 3: Mount provider around the app**

Find the top-level component export. Wrap the app's main JSX in `<PremiumGateProvider>`. The cleanest pattern: rename the existing `App` function to `AppInner`, then export a new `App` that wraps with the provider.

Pattern:

```typescript
export default function App() {
  return (
    <PremiumGateProvider>
      <AppInner />
    </PremiumGateProvider>
  );
}

function AppInner() {
  // ... existing App body
}
```

- [ ] **Step 4: Register 402 handler inside AppInner**

Add inside `AppInner`, near the top with the other hooks:

```typescript
  const gate = useGate();
  useEffect(() => {
    setPaymentRequiredHandler((err) => {
      gate.openGate({ reason: err.reason, detail: err });
    });
    return () => {
      setPaymentRequiredHandler(() => {
        /* noop unmount */
      });
    };
  }, [gate]);
```

If the existing `setPaymentRequiredHandler` accepts `null` (it doesn't per Task 5), use a noop function as shown above.

- [ ] **Step 5: Render PremiumGate at the AppInner root**

Inside the AppInner JSX, AT THE ROOT LEVEL (sibling of the existing top-level `<div>`), use a Fragment to render the gate:

```typescript
  return (
    <>
      <div className="min-h-screen ...">
        {/* existing content */}
      </div>
      <PremiumGate onNavigateToPremium={() => setActiveView('premium')} />
    </>
  );
```

If the existing JSX already starts with the `<div className="min-h-screen ...">`, wrap that div + the gate in a `<>...</>` Fragment.

- [ ] **Step 6: Add render for PremiumPage in the view switcher**

Find the section of `App.tsx` that renders the current module based on `activeView` (it'll look like a series of conditional renders or a switch). Add the case for `'premium'`:

```typescript
{activeView === 'premium' && <PremiumPage />}
```

Place it in the same block where the other modules render (e.g., next to `{activeView === 'espejo' && <EspejoModule ... />}`).

- [ ] **Step 7: Build check**

```bash
cd frontend && npm run build
```

Expected: build succeeds. If TS errors, fix them.

- [ ] **Step 8: Smoke test manual**

Start the backend (`cd backend && venv\Scripts\uvicorn.exe main:app --reload --port 8000` in a separate terminal). Then start Vite (`cd frontend && npm run dev`).

In browser:
1. Open http://localhost:5173
2. Register a new user (or log in)
3. Manually navigate to premium by setting `activeView='premium'` — easiest path: hardcode `setActiveView('premium')` temporarily, or add a button somewhere
4. Verify `/premium` shows: hero, toggle, table, FAQ
5. Verify clicking "Suscribirme" goes through (will 500 because Lemonsqueezy isn't configured — that's expected; the redirect is what we're checking)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(premium-ui): integrar 'premium' view + PremiumGateProvider + 402 handler"
```

---

## Task 9: ReflexionLibreEditor con paywall post-escritura

**Files:**
- Create: `frontend/src/espejo/ReflexionLibreEditor.tsx`

- [ ] **Step 1: Crear el editor**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\espejo\ReflexionLibreEditor.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { createReflexionLibre } from '../premium';

const ease = [0.16, 1, 0.3, 1] as const;
const DRAFT_PREFIX = 'reflexion-libre-draft-';

interface ReflexionLibreEditorProps {
  open: boolean;
  tipo: 'sefira' | 'arbol';
  sefiraId?: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Editor for a free-form reflection (sefirá-specific or whole-tree).
 *
 * Gating strategy: NO gate on open. The user writes freely. On Save, if the
 * backend returns 402 (free_reflection_limit), the apiFetch interceptor opens
 * the PremiumGate modal — we DO NOT clear the content. The text persists in
 * localStorage so a future Premium conversion can pick up where they left off.
 */
export function ReflexionLibreEditor({
  open,
  tipo,
  sefiraId,
  onClose,
  onSaved,
}: ReflexionLibreEditorProps) {
  const draftKey = `${DRAFT_PREFIX}${tipo}-${sefiraId ?? 'arbol'}`;
  const [contenido, setContenido] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore draft on open
  useEffect(() => {
    if (!open) return;
    try {
      const draft = localStorage.getItem(draftKey);
      if (draft) setContenido(draft);
    } catch {
      /* localStorage disabled — start fresh */
    }
  }, [open, draftKey]);

  // Persist draft on change (debounced via microtask)
  useEffect(() => {
    if (!open) return;
    try {
      if (contenido) localStorage.setItem(draftKey, contenido);
      else localStorage.removeItem(draftKey);
    } catch {
      /* noop */
    }
  }, [contenido, open, draftKey]);

  async function handleSave() {
    if (!contenido.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createReflexionLibre({
        tipo,
        sefira_id: sefiraId,
        contenido: contenido.trim(),
      });
      // Success: clear draft + close
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* noop */
      }
      setContenido('');
      onSaved();
      onClose();
    } catch (e) {
      // 402 already triggered the PremiumGate via interceptor — don't show a
      // separate error for that case. Show inline error only for other failures.
      const msg = e instanceof Error ? e.message : 'unknown';
      if (msg !== 'free_reflection_limit') {
        setError(msg);
      }
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Reflexión libre"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease }}
            className="relative w-full max-w-2xl rounded-2xl bg-stone-950/95 border border-stone-800/70 shadow-[0_24px_80px_rgba(0,0,0,0.6)] p-6 md:p-7 space-y-4"
          >
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">
                Reflexión libre
              </p>
              <h2 className="font-serif text-2xl text-amber-100/95">
                {tipo === 'sefira' ? `Reflexión sobre ${sefiraId}` : 'Reflexión sobre el árbol'}
              </h2>
            </div>

            <textarea
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder="Escribí lo que necesites volcar..."
              rows={10}
              className="w-full bg-stone-900/80 border border-stone-800/70 rounded-xl p-4 text-stone-200 text-sm placeholder-stone-600 focus:outline-none focus:border-amber-300/40 transition-colors resize-y"
            />

            {error && (
              <p className="text-red-300 text-sm" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full text-stone-400 hover:text-stone-200 text-xs tracking-wide transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submitting || !contenido.trim()}
                onClick={handleSave}
                className="px-5 py-2 rounded-full bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/40 text-amber-100 text-xs tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Guardando...' : 'Guardar reflexión'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: TS check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/espejo/ReflexionLibreEditor.tsx
git commit -m "feat(premium-ui): ReflexionLibreEditor con paywall post-escritura y draft localStorage"
```

---

## Task 10: Entry point para Reflexión Libre en EspejoModule

**Files:**
- Modify: `frontend/src/espejo/EspejoModule.tsx`

- [ ] **Step 1: Read existing EspejoModule structure**

Read `c:\Users\123\Desktop\Kabbalah Space\frontend\src\espejo\EspejoModule.tsx` to understand the current layout. Note: this module renders the SefirotTree, when a sefirá is clicked it opens a panel (probably `SefiraDetailPanel` or similar). The entry point for "Nueva reflexión libre" can live either inside that panel (per-sefirá) or at the top of the module (whole-tree).

For Task 10 scope, add BOTH entry points:

1. A "Reflexión libre del árbol" button somewhere visible in the EspejoModule (e.g., near the header, next to the tree).
2. (Optional, deferred to Task 14 if scope creep) A per-sefirá button when a sefirá detail panel is open.

Focus on the whole-tree button for this task.

- [ ] **Step 2: Add state and import**

At the top of `EspejoModule.tsx`, add:

```typescript
import { useState } from 'react';
import { ReflexionLibreEditor } from './ReflexionLibreEditor';
```

(If `useState` is already imported, just add `ReflexionLibreEditor`.)

Inside the component, add state:

```typescript
const [libreEditorOpen, setLibreEditorOpen] = useState(false);
```

- [ ] **Step 3: Add the trigger button**

Find a place in the JSX near the top of the module's render (after any header or hero, before the tree). Add:

```tsx
<button
  type="button"
  onClick={() => setLibreEditorOpen(true)}
  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-300/10 hover:bg-amber-300/20 border border-amber-300/30 text-amber-100 text-xs tracking-wide transition-colors"
>
  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
    edit_note
  </span>
  Nueva reflexión libre
</button>
```

Place it where it doesn't disrupt the existing layout. If the module has a header section with the title "Mi Árbol de la Vida", put it in that header next to or below the title.

- [ ] **Step 4: Render the editor**

At the end of the module's JSX (before the closing tag of the root element):

```tsx
<ReflexionLibreEditor
  open={libreEditorOpen}
  tipo="arbol"
  onClose={() => setLibreEditorOpen(false)}
  onSaved={() => {
    /* could trigger a refresh of reflexión history here */
  }}
/>
```

- [ ] **Step 5: Build check + smoke**

```bash
cd frontend && npm run build
```

Then with backend running:
1. Login as free user
2. Click "Nueva reflexión libre" → editor opens
3. Type some text → close (drafts persist on next open — verify)
4. Type text → click "Guardar reflexión" → 201 OK (first reflection of the month)
5. Open again, type more → click Guardar → expect 402, PremiumGate modal opens, text remains intact in editor

- [ ] **Step 6: Commit**

```bash
git add frontend/src/espejo/EspejoModule.tsx
git commit -m "feat(premium-ui): entry 'Nueva reflexion libre' en EspejoModule"
```

---

## Task 11: SubscriptionSection + CuentaPage

**Files:**
- Create: `frontend/src/cuenta/SubscriptionSection.tsx`
- Create: `frontend/src/cuenta/CuentaPage.tsx`

- [ ] **Step 1: Crear SubscriptionSection**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\cuenta\SubscriptionSection.tsx`:

```typescript
import { useState } from 'react';

import { getPortalUrl } from '../premium/api';
import { usePremium } from '../premium/usePremium';

interface SubscriptionSectionProps {
  onNavigateToPremium: () => void;
}

export function SubscriptionSection({ onNavigateToPremium }: SubscriptionSectionProps) {
  const { status, loading, isPremium } = usePremium();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpenPortal() {
    setOpening(true);
    setError(null);
    try {
      const url = await getPortalUrl();
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
      setOpening(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-[#15181d] border border-stone-700/40 rounded-2xl p-6">
        <p className="text-stone-400 text-sm">Cargando suscripción...</p>
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="bg-[#15181d] border border-stone-700/40 rounded-2xl p-6 space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-2">
            Suscripción
          </p>
          <h3 className="font-serif text-xl text-amber-100/95 mb-2">Sos usuario Free</h3>
          <p className="text-stone-400 text-sm">
            Premium libera reflexión sin tope, recurrencias en el calendario, IA personalizada y seguimiento por correo.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateToPremium}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/40 text-amber-100 text-xs tracking-wide transition-colors"
        >
          Ver planes Premium
        </button>
      </div>
    );
  }

  const sub = status?.subscription;
  const planLabel = sub?.plan === 'yearly' ? 'Anual' : 'Mensual';
  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  return (
    <div className="bg-[#15181d] border border-amber-300/20 rounded-2xl p-6 space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/70 mb-2">
          Suscripción Premium
        </p>
        <h3 className="font-serif text-xl text-amber-100/95 mb-3">Plan {planLabel} activo</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-400">Estado</dt>
            <dd className="text-stone-200">{sub?.status === 'trial' ? 'En trial' : 'Activo'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-400">Próximo cobro</dt>
            <dd className="text-stone-200">{periodEnd}</dd>
          </div>
          {sub?.canceled_at && (
            <div className="flex justify-between">
              <dt className="text-stone-400">Cancelado</dt>
              <dd className="text-amber-300/80">Acceso hasta {periodEnd}</dd>
            </div>
          )}
        </dl>
      </div>

      <button
        type="button"
        onClick={handleOpenPortal}
        disabled={opening}
        className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-xs tracking-wide transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          settings
        </span>
        {opening ? 'Abriendo portal...' : 'Gestionar suscripción'}
      </button>

      {error && (
        <p className="text-red-300 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear CuentaPage**

Create `c:\Users\123\Desktop\Kabbalah Space\frontend\src\cuenta\CuentaPage.tsx`:

```typescript
import { motion } from 'framer-motion';

import { useAuth } from '../auth/AuthContext';
import { SubscriptionSection } from './SubscriptionSection';

const ease = [0.16, 1, 0.3, 1] as const;

interface CuentaPageProps {
  onNavigateToPremium: () => void;
}

export function CuentaPage({ onNavigateToPremium }: CuentaPageProps) {
  const auth = useAuth();

  if (auth.status !== 'authenticated' || !auth.user) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-10 text-center">
        <p className="text-stone-400">Iniciá sesión para ver tu cuenta.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="w-full max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-8"
    >
      <div className="bg-[#15181d] border border-stone-700/40 rounded-2xl p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-2">Perfil</p>
        <p className="text-stone-200 text-base font-medium">{auth.user.nombre}</p>
        <p className="text-stone-400 text-sm">{auth.user.email}</p>
        <p className="text-stone-500 text-[10px] uppercase tracking-[0.14em] mt-1">
          via {auth.user.provider === 'google' ? 'Google' : 'Email'}
        </p>
      </div>

      <SubscriptionSection onNavigateToPremium={onNavigateToPremium} />
    </motion.div>
  );
}
```

- [ ] **Step 3: TS check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/cuenta/SubscriptionSection.tsx frontend/src/cuenta/CuentaPage.tsx
git commit -m "feat(premium-ui): CuentaPage + SubscriptionSection (free / premium views)"
```

---

## Task 12: Integrar 'cuenta' view + entry en UserMenu

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/auth/UserMenu.tsx`

- [ ] **Step 1: Add CuentaPage import + render in App.tsx**

Edit `App.tsx`:

```typescript
import { CuentaPage } from './cuenta/CuentaPage';
```

In the view switcher section, add:

```typescript
{activeView === 'cuenta' && <CuentaPage onNavigateToPremium={() => setActiveView('premium')} />}
```

- [ ] **Step 2: Add a "Mi cuenta" item in UserMenu dropdown**

Edit `c:\Users\123\Desktop\Kabbalah Space\frontend\src\auth\UserMenu.tsx`.

The `UserMenu` is a self-contained component that doesn't know about ViewKey. The cleanest decoupling: emit a custom DOM event when the user clicks "Mi cuenta", and `App.tsx` listens for it.

In `UserMenu.tsx`, find the dropdown render (the `<motion.div role="menu">` block, around line 102). After the `<KsaiToggleRow />` block (around line 127), and BEFORE the "Cerrar sesión" button, add:

```tsx
<button
  type="button"
  role="menuitem"
  onClick={() => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('navigate:cuenta'));
  }}
  className="w-full px-4 py-2.5 flex items-center gap-2 text-stone-300 hover:text-amber-200 hover:bg-stone-900/80 text-xs tracking-wide transition-colors border-t border-stone-800/70"
>
  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
    person
  </span>
  Mi cuenta
</button>
```

- [ ] **Step 3: Listen for the event in App.tsx**

In `AppInner`, add a `useEffect`:

```typescript
useEffect(() => {
  const handler = () => setActiveView('cuenta');
  window.addEventListener('navigate:cuenta', handler);
  return () => window.removeEventListener('navigate:cuenta', handler);
}, []);
```

- [ ] **Step 4: Build check**

```bash
cd frontend && npm run build
```

Expected: success.

- [ ] **Step 5: Smoke test**

With backend running:
1. Login → click avatar → click "Mi cuenta" → CuentaPage renders
2. Should show "Sos usuario Free" + "Ver planes Premium" CTA
3. Click CTA → navigates to PremiumPage

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/auth/UserMenu.tsx
git commit -m "feat(premium-ui): integrar vista cuenta + entry en UserMenu dropdown"
```

---

## Task 13: UI gating en ActivityForm

**Files:**
- Modify: `frontend/src/calendar/ActivityForm.tsx` (or similar — verify exact name)

- [ ] **Step 1: Read existing form structure**

Read `c:\Users\123\Desktop\Kabbalah Space\frontend\src\calendar\ActivityForm.tsx`. Identify:
1. Where the recurrence picker is rendered (probably a checkbox or expandable section toggling `payload.rrule`)
2. Where the "Save" button is

- [ ] **Step 2: Disable recurrencias for free users**

At the top of the component, add:

```typescript
import { useGate } from '../premium/PremiumGateContext';
import { usePremium } from '../premium/usePremium';
```

Inside the component:

```typescript
const { isPremium } = usePremium();
const gate = useGate();
```

Find the recurrence-related UI (likely a `RecurrencePicker` or a checkbox like "Repetir actividad"). Wrap it with disabled state when `!isPremium`:

```tsx
{isPremium ? (
  <RecurrencePicker ... />
) : (
  <button
    type="button"
    onClick={() =>
      gate.openGate({
        reason: 'recurrence_premium',
        detail: { error: 'premium_required', reason: 'recurrence_premium' },
      })
    }
    className="w-full text-left px-4 py-3 rounded-xl bg-stone-900/60 border border-stone-800/60 text-stone-400 text-sm hover:border-amber-300/30 hover:text-amber-100 transition-colors flex items-center justify-between"
  >
    <span>Repetir actividad</span>
    <span className="text-[10px] uppercase tracking-[0.14em] text-amber-300/70">
      Premium
    </span>
  </button>
)}
```

(Adapt the JSX shape to whatever the existing recurrence picker looks like — the goal is: if premium, show the real picker; if free, show a Premium-prompting button that opens the gate.)

- [ ] **Step 3: Build check**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Smoke test**

Login as free user, open the calendar, click "+ Nueva actividad". The recurrence option should be a "Premium" button instead of the picker. Click it → PremiumGate opens with `reason='recurrence_premium'`.

Login as premium user (manually insert a Subscription row in the DB for your user, or test in another way), and the picker should render normally.

The 10-activity limit doesn't need UI changes here — the backend 402 fires via the global interceptor and opens the PremiumGate automatically when the user tries to submit.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/calendar/ActivityForm.tsx
git commit -m "feat(premium-ui): gate de recurrencias en ActivityForm con prompt premium"
```

---

## Task 14: Smoke test end-to-end manual completo

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Backend en una terminal**

```bash
cd backend
venv\Scripts\uvicorn.exe main:app --reload --port 8000
```

- [ ] **Step 2: Frontend en otra terminal**

```bash
cd frontend
npm run dev
```

- [ ] **Step 3: Verify cada gate desde la UI**

Open http://localhost:5173 in browser. Register a fresh user `qa-premium@test.com`.

**Test 1 — Reflexión libre (paywall post-escritura):**
- Espejo → "Nueva reflexión libre" → escribir texto → Guardar → 201 OK
- Repetir → escribir texto → Guardar → **PremiumGate aparece** con reason="free_reflection_limit"
- El texto NO se borra. Cerrar el modal con "Ahora no". Texto sigue ahí.

**Test 2 — Calendario actividad 11:**
- Calendario → crear 10 actividades
- Intentar la 11ma → **PremiumGate** con reason="actividad_limit", muestra current=10, max=10

**Test 3 — Recurrencia premium:**
- En "+ Nueva actividad", el toggle de recurrencia muestra "Premium" en lugar del picker
- Click → **PremiumGate** con reason="recurrence_premium"

**Test 4 — Histórico:**
- Mi Evolución → cambiar `meses` a algo > 12 (si la UI permite) → backend clampa silenciosamente a 12. Verificar con DevTools que la respuesta tiene 12 buckets.
- (Opcional) Hacer un GET directo a /espejo/evolucion/jesed/semanas?mes=2024-01 desde DevTools → 402

**Test 5 — Página /premium:**
- Click Mi cuenta → "Ver planes Premium" → PremiumPage carga
- Toggle Mensual/Anual responde
- Click "Suscribirme" → 500 esperado (Lemonsqueezy no configurado en sandbox) — eso confirma que `/billing/checkout` se llamó

**Test 6 — /premium con promo en URL:**
- Crear un promo code via CLI: `cd backend && venv\Scripts\python.exe scripts/create_promo_code.py --code SMOKE7 --trial-days 7 --max-uses 10`
- Abrir `http://localhost:5173/?promo=SMOKE7` (depende de cómo el frontend lee el URL)
- Navegar a PremiumPage → debe mostrar el banner con código SMOKE7

**Test 7 — Mi cuenta como premium:**
- En la DB, insertar un Subscription para qa-premium con status=active
- Refrescar el navegador
- Mi cuenta → ahora muestra "Plan Mensual activo" + "Gestionar suscripción"

- [ ] **Step 4: Documentar resultados en commit**

```bash
git commit --allow-empty -m "test(premium-ui): smoke test e2e completo OK (gates + /premium + paywall post-escritura)"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Página `/premium` con hero + tabla + toggle + FAQ + banner promo — Tasks 6, 7
- ✅ `<PremiumGate>` reusable con copy contextual — Tasks 3, 4
- ✅ Gancho: reflexión libre con paywall post-escritura + draft localStorage — Task 9
- ✅ Mi Cuenta → Suscripción — Tasks 11, 12
- ✅ Interceptor global de 402/409 — Task 5
- ✅ UI gating en ActivityForm — Task 13
- ✅ Smoke test e2e — Task 14

**Fuera de scope (intencional):**
- Toggles de preferencias de email → Plan 2
- Per-sefirá button para reflexión libre dentro del SefiraDetailPanel — agregable en una iteración futura sin bloquear este plan

**2. Placeholder scan:** Todos los steps tienen código completo o comandos exactos. No hay TBDs.

**3. Type consistency:**
- `BillingStatus`, `GateReason`, `GateError` consistentes entre `types.ts` (Task 1), context (Task 3), copy (Task 4), interceptor (Task 5)
- `SubscriptionPlan` (`'monthly' | 'yearly'`) consistente entre toggle (Task 6), page (Task 7), api (Task 1)
- `apiFetch` interceptor (Task 5) emite `GateError` que match el shape del backend

**4. Dependencias entre tasks:**
- Task 5 (interceptor) importa de Task 1 (types) → OK
- Task 7 (PremiumPage) usa Tasks 1, 2, 6 → OK
- Task 8 (App integration) usa Tasks 3, 4, 5, 7 → OK
- Task 9 (ReflexionLibre editor) usa Task 1 (api) — el paywall lo dispara el interceptor de Task 5 → OK
- Task 13 (ActivityForm) usa Tasks 2, 3 → OK
