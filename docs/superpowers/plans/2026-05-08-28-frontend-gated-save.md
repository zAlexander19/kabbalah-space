# Frontend Gated Save + Draft Preservation Implementation Plan (Issue #28)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate every "save" action across Espejo and Calendar with a flow that preserves what the user typed (autosave to localStorage), prompts for login if anonymous, and confirms before persisting — without losing drafts on cancel/refresh.

**Architecture:** Phase 2 of the privacy work (spec: `docs/superpowers/specs/2026-05-06-privacidad-y-gated-save-design.md`). Three new units in `frontend/src/shared/drafts/`: a pure storage layer (localStorage-backed, owner-tagged, 24h TTL for anonymous), a `useDraftPersistence` hook (autosave + rehydrate), and a `useGatedSave` hook (auth check → confirm dialog → POST). Two new UI components (`ConfirmSaveDialog`, `PendingDraftBadge`). The `AuthContext` is extended with `triggeredBy` flag on `openLoginModal`, a `gatedSaveSignal` counter that fires after login, and `wipeAll()` on logout / 401 / cross-user transitions.

**Tech Stack:** React 19, TypeScript, framer-motion, existing `apiFetch`/`useAuth` from `frontend/src/auth/`.

**Branch & merge:** All work on `feat/m6-28-frontend-gated-save` (already created). Squash-merge to `main`. Closes #28.

**Test strategy:** No automated tests — frontend has no vitest setup. Plan relies on `tsc -b --noEmit`, `vite build`, and explicit manual verification scripts at the end. Setting up vitest is out of scope (follow-up).

---

## Pre-Task: Confirm starting state

- [ ] **Step 1: Verify branch and base**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space"
git status
git log --oneline -3
```

Expected: on `feat/m6-28-frontend-gated-save`, recent commit on main is `feat(#30): per-user ownership ... (#37)`. No staged or unstaged changes.

- [ ] **Step 2: Quick build smoke**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npm run build
```

Expected: `vite build` succeeds, ~468 KB / ~140 KB gzip. If it fails, stop — something is wrong with the base.

---

## Task 1: `shared/drafts/storage.ts` — pure persistence layer

**Files:**
- Create: `frontend/src/shared/drafts/storage.ts`

This is the lowest layer. No React, no DOM beyond `localStorage`. All other files in this module will import from here.

- [ ] **Step 1: Create the file with this exact content**

```ts
/**
 * Pure localStorage-backed draft persistence.
 *
 * Each draft is keyed by `kabbalah_drafts:<scope>:<key>` and carries:
 *   - value: the user's in-progress data
 *   - owner: user_id when authenticated, null when anonymous
 *   - updatedAt: epoch ms of last write
 *
 * Reads are filtered by current owner (you only see drafts that match the
 * caller's identity). Anonymous drafts expire after 24h; logged-in drafts
 * have no expiration. Logout calls wipeAll() to leave nothing behind.
 */

const NAMESPACE = 'kabbalah_drafts:';
const ANON_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type Draft<T> = {
  value: T;
  owner: string | null;
  updatedAt: number;
};

function makeKey(scope: string, key: string): string {
  return `${NAMESPACE}${scope}:${key}`;
}

/**
 * Read a draft for the given (scope, key) pair if it belongs to the
 * current owner and hasn't expired. Returns null otherwise (and lazily
 * deletes the storage entry if the TTL ran out).
 */
export function readDraft<T>(scope: string, key: string, currentOwner: string | null): T | null {
  try {
    const raw = localStorage.getItem(makeKey(scope, key));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft<T>;

    // Privacy: drafts are visible only to their owner. Anonymous (null) drafts
    // are visible only when the caller is also anonymous.
    if (draft.owner !== currentOwner) return null;

    // TTL only applies to anonymous drafts.
    if (draft.owner === null && Date.now() - draft.updatedAt > ANON_TTL_MS) {
      localStorage.removeItem(makeKey(scope, key));
      return null;
    }

    return draft.value;
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded) or
    // the stored JSON may be malformed. Treat as "no draft".
    return null;
  }
}

/** Write/overwrite a draft for the given (scope, key). Owner is current at write-time. */
export function writeDraft<T>(scope: string, key: string, value: T, currentOwner: string | null): void {
  try {
    const draft: Draft<T> = { value, owner: currentOwner, updatedAt: Date.now() };
    localStorage.setItem(makeKey(scope, key), JSON.stringify(draft));
  } catch {
    /* ignore — localStorage may be unavailable */
  }
}

export function clearDraft(scope: string, key: string): void {
  try {
    localStorage.removeItem(makeKey(scope, key));
  } catch { /* ignore */ }
}

/**
 * Delete every draft in our namespace. Called on logout, on 401-forced
 * logout, and on detected user-switch.
 */
export function wipeAll(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NAMESPACE)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

/**
 * After an anonymous user logs in, "adopt" their drafts by rewriting
 * the owner field from null to the new user_id. Drafts already owned
 * by another user are left untouched (they remain invisible to the
 * current user via readDraft's owner filter).
 */
export function adoptAnonymous(newOwner: string): void {
  try {
    const updates: Array<{ key: string; raw: string }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(NAMESPACE)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const draft = JSON.parse(raw) as Draft<unknown>;
        if (draft.owner === null) {
          draft.owner = newOwner;
          updates.push({ key: k, raw: JSON.stringify(draft) });
        }
      } catch { /* skip malformed entry */ }
    }
    updates.forEach((u) => localStorage.setItem(u.key, u.raw));
  } catch { /* ignore */ }
}
```

- [ ] **Step 2: Type-check**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
```

Expected: clean (no errors). The file is self-contained; no other module imports it yet.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/drafts/storage.ts
git commit -m "feat(drafts): localStorage layer with owner tagging + 24h anon TTL"
```

---

## Task 2: `shared/drafts/useDraftPersistence.ts` — autosave + rehydrate hook

**Files:**
- Create: `frontend/src/shared/drafts/useDraftPersistence.ts`

This hook owns:
- Reading the persisted draft on mount and exposing it as `hydrated` (caller decides how to merge into state).
- Debounced (250 ms) autosave on every value change.
- Cleanup of pending writes on unmount or `clear()`.

- [ ] **Step 1: Create the file**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../auth';
import { clearDraft, readDraft, writeDraft } from './storage';

const DEBOUNCE_MS = 250;

export type DraftPersistence<T> = {
  /** The draft value stored at mount time, or null if none was found.
   *  Stable for the lifetime of the hook — caller uses it as initial state seed. */
  hydrated: T | null;
  /** True when there's a stored draft that doesn't match the current value.
   *  Useful to render an indicator like "you have an unsaved draft". */
  hasPendingDraft: boolean;
  /** Cancel any pending debounced write and remove the stored draft. */
  clear: () => void;
};

/**
 * Persist `value` for the given (scope, key) under the currently-active
 * user identity. On mount, returns the previously-stored draft (if any)
 * so the caller can hydrate its initial state.
 *
 * Owner identity comes from useAuth(). Anonymous drafts are kept under
 * `owner: null` and expire after 24h.
 */
export function useDraftPersistence<T>(scope: string, key: string, value: T): DraftPersistence<T> {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;

  // Read once on mount. The ref lets us avoid re-reading and reseeding on
  // every render while still exposing a stable value to the caller.
  const initialOwnerRef = useRef(ownerId);
  const [hydrated] = useState<T | null>(() => readDraft<T>(scope, key, initialOwnerRef.current));

  const timerRef = useRef<number | null>(null);

  // Debounced write. Re-runs whenever value or owner changes.
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      writeDraft(scope, key, value, ownerId);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [scope, key, value, ownerId]);

  const clear = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    clearDraft(scope, key);
  }, [scope, key]);

  // Cheap structural compare — for the maps/objects we'll be persisting,
  // JSON serialization is fast enough and avoids hand-rolled equality.
  const hasPendingDraft = hydrated !== null && JSON.stringify(hydrated) !== JSON.stringify(value);

  return { hydrated, hasPendingDraft, clear };
}
```

- [ ] **Step 2: Type-check**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/drafts/useDraftPersistence.ts
git commit -m "feat(drafts): useDraftPersistence hook with debounced autosave"
```

---

## Task 3: `shared/drafts/useGatedSave.ts` — auth-gated save flow

**Files:**
- Create: `frontend/src/shared/drafts/useGatedSave.ts`

This hook is the orchestrator for "click save → maybe login → confirm → POST". It depends on `AuthContext` exposing two new things that Task 7 will add: a `triggeredBy`-aware `openLoginModal` and a monotonically-increasing `gatedSaveSignal` counter that fires once per gated-save login completion.

- [ ] **Step 1: Create the file**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../auth';

export type GatedSave = {
  /** Call when the user clicks "Save". If anonymous, opens the LoginModal
   *  with triggeredBy=gated-save; if authenticated, opens the confirm dialog
   *  immediately. Idempotent while a save is in flight. */
  triggerSave: () => void;
  /** True when the confirm dialog should be visible. */
  isConfirming: boolean;
  /** True while the onSubmit callback is awaiting the network. */
  isSaving: boolean;
  /** Run the user's onSubmit. Closes the confirm dialog on success. */
  confirm: () => Promise<void>;
  /** Dismiss the confirm dialog without saving. */
  cancel: () => void;
};

/**
 * Wrap a save action with the gated flow:
 *   anonymous → open LoginModal(triggeredBy: 'gated-save') → on login,
 *               auto-open confirm dialog → user confirms → onSubmit()
 *   authenticated → open confirm dialog immediately → onSubmit()
 *
 * `onSubmit` should throw on failure; the caller is responsible for surfacing
 * the error message in its own UI (we don't display errors here so the caller
 * can format them in context).
 */
export function useGatedSave(onSubmit: () => Promise<void>): GatedSave {
  const { status, openLoginModal, gatedSaveSignal } = useAuth();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAfterLogin, setPendingAfterLogin] = useState(false);
  const lastSeenSignalRef = useRef(gatedSaveSignal);

  const triggerSave = useCallback(() => {
    if (isConfirming || isSaving) return; // dedup multi-clicks
    if (status === 'authenticated') {
      setIsConfirming(true);
    } else {
      setPendingAfterLogin(true);
      openLoginModal('gated-save');
    }
  }, [isConfirming, isSaving, status, openLoginModal]);

  // When a gated-save login completes, AuthContext bumps gatedSaveSignal.
  // Any hook instance whose triggerSave kicked off the flow will have
  // pendingAfterLogin=true and react by opening its confirm dialog.
  useEffect(() => {
    if (gatedSaveSignal !== lastSeenSignalRef.current && pendingAfterLogin && status === 'authenticated') {
      lastSeenSignalRef.current = gatedSaveSignal;
      setPendingAfterLogin(false);
      setIsConfirming(true);
    }
  }, [gatedSaveSignal, pendingAfterLogin, status]);

  const confirm = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSubmit();
      setIsConfirming(false);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, onSubmit]);

  const cancel = useCallback(() => {
    if (isSaving) return; // can't cancel mid-save
    setIsConfirming(false);
  }, [isSaving]);

  return { triggerSave, isConfirming, isSaving, confirm, cancel };
}
```

- [ ] **Step 2: Type-check (will fail until AuthContext is updated in Task 7)**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit 2>&1 | head -20
```

Expected: errors mentioning that `openLoginModal` doesn't accept arguments and that `gatedSaveSignal` doesn't exist on `AuthContextValue`. **This is fine — Task 7 adds them.** Do not try to "fix" by adding shims here.

- [ ] **Step 3: Commit anyway** (the file is correct against the planned AuthContext API)

```bash
git add frontend/src/shared/drafts/useGatedSave.ts
git commit -m "feat(drafts): useGatedSave hook (orchestrates login + confirm + POST)"
```

(Subsequent tasks depend on this file. Task 7 makes the type-check green.)

---

## Task 4: `shared/drafts/ConfirmSaveDialog.tsx` — confirmation modal

**Files:**
- Create: `frontend/src/shared/drafts/ConfirmSaveDialog.tsx`

Generic confirm modal styled to match the existing `LoginModal` and `AnswersGridModal`. Renders via `createPortal` so it escapes any transformed ancestor.

- [ ] **Step 1: Create the file**

```tsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

type Props = {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isSaving?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Generic two-button confirmation modal. Renders to document.body via portal.
 * The body is a ReactNode so callers can inject specific copy
 * ("Las respuestas se bloquearán por 30 días" / "Se creará la actividad").
 */
export function ConfirmSaveDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isSaving = false,
  errorMessage = null,
  onConfirm,
  onCancel,
}: Props) {
  // ESC closes (when not saving)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isSaving, onCancel]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-save-dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease }}
          className="fixed inset-0 z-[120] flex items-center justify-center px-4"
          aria-modal="true"
          role="dialog"
          aria-labelledby="confirm-save-title"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={isSaving ? undefined : onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.28, ease }}
            className="relative w-full max-w-md bg-stone-950/90 backdrop-blur-2xl border border-stone-800/60 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] overflow-hidden"
          >
            <div className="relative p-6">
              <h2
                id="confirm-save-title"
                className="font-serif text-xl text-amber-100/90 font-light tracking-tight mb-3"
              >
                {title}
              </h2>
              <div className="text-sm text-stone-300/90 leading-relaxed mb-5">
                {body}
              </div>

              {errorMessage && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 text-red-200 text-xs leading-relaxed">
                  {errorMessage}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg text-stone-300 hover:text-stone-100 hover:bg-stone-800/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-wide transition-colors"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/30 text-amber-100 text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_14px_rgba(233,195,73,0.15)]"
                >
                  {isSaving ? 'Guardando…' : confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit 2>&1 | head -10
```

Expected: still the AuthContext-related errors from Task 3, but no NEW errors from this file. If `ConfirmSaveDialog.tsx` itself has TS errors, fix them before committing.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/drafts/ConfirmSaveDialog.tsx
git commit -m "feat(drafts): ConfirmSaveDialog component"
```

---

## Task 5: `shared/drafts/PendingDraftBadge.tsx` — "unsaved draft" chip

**Files:**
- Create: `frontend/src/shared/drafts/PendingDraftBadge.tsx`

Small inline notice. Renders only when `visible` is true.

- [ ] **Step 1: Create the file**

```tsx
import { motion } from 'framer-motion';

type Props = {
  visible: boolean;
  message?: string;
};

/**
 * Inline indicator: "you have an unsaved draft". Render where the user's
 * eyes are — typically just above the form they're editing.
 */
export function PendingDraftBadge({ visible, message = 'Tenés un borrador sin guardar' }: Props) {
  if (!visible) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-300/10 border border-amber-300/30 text-amber-200/85 text-[11px] tracking-wide"
      role="status"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-300/80" aria-hidden />
      {message}
    </motion.div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit 2>&1 | head -10
```

Expected: still only the Task-3 AuthContext errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/drafts/PendingDraftBadge.tsx
git commit -m "feat(drafts): PendingDraftBadge inline indicator"
```

---

## Task 6: `shared/drafts/index.ts` — barrel export

**Files:**
- Create: `frontend/src/shared/drafts/index.ts`

- [ ] **Step 1: Create the file**

```ts
export {
  readDraft,
  writeDraft,
  clearDraft,
  wipeAll,
  adoptAnonymous,
} from './storage';

export { useDraftPersistence, type DraftPersistence } from './useDraftPersistence';
export { useGatedSave, type GatedSave } from './useGatedSave';
export { ConfirmSaveDialog } from './ConfirmSaveDialog';
export { PendingDraftBadge } from './PendingDraftBadge';
```

- [ ] **Step 2: Type-check**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit 2>&1 | head -10
```

Expected: still only Task-3 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/drafts/index.ts
git commit -m "feat(drafts): barrel export for the drafts module"
```

---

## Task 7: `AuthContext` — triggeredBy + gatedSaveSignal + wipe on logout

**Files:**
- Modify: `frontend/src/auth/types.ts`
- Modify: `frontend/src/auth/AuthContext.tsx`

After this task, the type errors from Task 3 disappear.

- [ ] **Step 1: Read the current `AuthContextValue` type definition**

```bash
grep -n "AuthContextValue\|openLoginModal" frontend/src/auth/types.ts
```

The file defines `AuthContextValue` with `openLoginModal: () => void`. We're going to widen the signature.

- [ ] **Step 2: Update `frontend/src/auth/types.ts`**

Find the line:

```ts
  openLoginModal: () => void;
```

Replace with:

```ts
  openLoginModal: (triggeredBy?: 'gated-save' | 'manual') => void;
  /** Monotonic counter, incremented once after each successful login that
   *  was triggered by a gated-save flow. Consumers (useGatedSave) watch this
   *  to know when to open their confirm dialog. */
  gatedSaveSignal: number;
```

- [ ] **Step 3: Update `frontend/src/auth/AuthContext.tsx`** — adopt + wipe + signal

This is the biggest change. Make these edits in order.

**Edit 3a:** Add the new import at the top (just below the existing `setUnauthorizedHandler` import):

Find:

```ts
import {
  fetchAuthConfig,
  fetchMe,
  getStoredToken,
  googleAuthorizeUrl,
  loginEmail,
  registerEmail,
  setStoredToken,
  setUnauthorizedHandler,
} from './api';
```

Add this line right after that import block:

```ts
import { adoptAnonymous, wipeAll } from '../shared/drafts/storage';
```

**Edit 3b:** Add the new state inside `AuthProvider`. Find this block:

```ts
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [oauthError, setOauthError] = useState<OAuthErrorCode | null>(null);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
```

Replace with:

```ts
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [oauthError, setOauthError] = useState<OAuthErrorCode | null>(null);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [lastTriggeredBy, setLastTriggeredBy] = useState<'gated-save' | 'manual' | null>(null);
  const [gatedSaveSignal, setGatedSaveSignal] = useState<number>(0);
```

**Edit 3c:** Update `loginWithEmail` to adopt drafts + bump the signal. Find:

```ts
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const { access_token } = await loginEmail(email, password);
    setStoredToken(access_token);
    const me = await fetchMe();
    setUser(me);
    setStatus('authenticated');
    setIsLoginModalOpen(false);
  }, []);
```

Replace with:

```ts
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const { access_token } = await loginEmail(email, password);
    setStoredToken(access_token);
    const me = await fetchMe();
    adoptAnonymous(me.id);
    setUser(me);
    setStatus('authenticated');
    setIsLoginModalOpen(false);
    setGatedSaveSignal((n) => n + 1);
  }, []);
```

**Edit 3d:** Mirror the change in `registerWithEmail`. Find:

```ts
  const registerWithEmail = useCallback(async (email: string, password: string, nombre: string) => {
    await registerEmail(email, password, nombre);
    // Auto-login so the user lands authenticated.
    const { access_token } = await loginEmail(email, password);
    setStoredToken(access_token);
    const me = await fetchMe();
    setUser(me);
    setStatus('authenticated');
    setIsLoginModalOpen(false);
  }, []);
```

Replace with:

```ts
  const registerWithEmail = useCallback(async (email: string, password: string, nombre: string) => {
    await registerEmail(email, password, nombre);
    // Auto-login so the user lands authenticated.
    const { access_token } = await loginEmail(email, password);
    setStoredToken(access_token);
    const me = await fetchMe();
    adoptAnonymous(me.id);
    setUser(me);
    setStatus('authenticated');
    setIsLoginModalOpen(false);
    setGatedSaveSignal((n) => n + 1);
  }, []);
```

**Edit 3e:** Update `logout` to wipe drafts. Find:

```ts
  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);
```

Replace with:

```ts
  const logout = useCallback(() => {
    wipeAll();
    setStoredToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);
```

**Edit 3f:** Update `openLoginModal` to accept the trigger flag. Find:

```ts
  const openLoginModal = useCallback(() => setIsLoginModalOpen(true), []);
```

Replace with:

```ts
  const openLoginModal = useCallback((triggeredBy: 'gated-save' | 'manual' = 'manual') => {
    setLastTriggeredBy(triggeredBy);
    setIsLoginModalOpen(true);
  }, []);
```

**Edit 3g:** Update `closeLoginModal` to clear the trigger. Find:

```ts
  const closeLoginModal = useCallback(() => {
    setIsLoginModalOpen(false);
    setOauthError(null);
  }, []);
```

Replace with:

```ts
  const closeLoginModal = useCallback(() => {
    setIsLoginModalOpen(false);
    setOauthError(null);
    setLastTriggeredBy(null);
  }, []);
```

**Edit 3h:** Update the `setUnauthorizedHandler` callback to wipe drafts on 401. Find:

```ts
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('anonymous');
      setIsLoginModalOpen(true);
    });
```

Replace with:

```ts
    setUnauthorizedHandler(() => {
      wipeAll();
      setUser(null);
      setStatus('anonymous');
      setIsLoginModalOpen(true);
    });
```

**Edit 3i:** Reference `lastTriggeredBy` so the gated-save signal bump only fires when appropriate. Find both `setGatedSaveSignal((n) => n + 1);` lines (added in 3c and 3d) and replace each with:

```ts
    if (lastTriggeredBy === 'gated-save') {
      setGatedSaveSignal((n) => n + 1);
    }
    setLastTriggeredBy(null);
```

So `loginWithEmail` becomes (after this edit):

```ts
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const { access_token } = await loginEmail(email, password);
    setStoredToken(access_token);
    const me = await fetchMe();
    adoptAnonymous(me.id);
    setUser(me);
    setStatus('authenticated');
    setIsLoginModalOpen(false);
    if (lastTriggeredBy === 'gated-save') {
      setGatedSaveSignal((n) => n + 1);
    }
    setLastTriggeredBy(null);
  }, [lastTriggeredBy]);
```

And `registerWithEmail` becomes:

```ts
  const registerWithEmail = useCallback(async (email: string, password: string, nombre: string) => {
    await registerEmail(email, password, nombre);
    const { access_token } = await loginEmail(email, password);
    setStoredToken(access_token);
    const me = await fetchMe();
    adoptAnonymous(me.id);
    setUser(me);
    setStatus('authenticated');
    setIsLoginModalOpen(false);
    if (lastTriggeredBy === 'gated-save') {
      setGatedSaveSignal((n) => n + 1);
    }
    setLastTriggeredBy(null);
  }, [lastTriggeredBy]);
```

(Note: `lastTriggeredBy` was added to each callback's deps array.)

**Edit 3j:** Update the `value` memo to include `gatedSaveSignal`. Find:

```ts
  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    oauthError,
    clearOAuthError,
    googleOAuthEnabled,
    isLoginModalOpen,
    openLoginModal,
    closeLoginModal,
    loginWithEmail,
    registerWithEmail,
    startGoogleOAuth,
    logout,
  }), [
    user, status, oauthError, clearOAuthError,
    googleOAuthEnabled, isLoginModalOpen, openLoginModal, closeLoginModal,
    loginWithEmail, registerWithEmail, startGoogleOAuth, logout,
  ]);
```

Replace with:

```ts
  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    oauthError,
    clearOAuthError,
    googleOAuthEnabled,
    isLoginModalOpen,
    openLoginModal,
    closeLoginModal,
    loginWithEmail,
    registerWithEmail,
    startGoogleOAuth,
    logout,
    gatedSaveSignal,
  }), [
    user, status, oauthError, clearOAuthError,
    googleOAuthEnabled, isLoginModalOpen, openLoginModal, closeLoginModal,
    loginWithEmail, registerWithEmail, startGoogleOAuth, logout,
    gatedSaveSignal,
  ]);
```

- [ ] **Step 4: Type-check — should be clean now**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
```

Expected: zero errors. Both Task-3 errors and new ones should be resolved.

- [ ] **Step 5: Build smoke**

```bash
npm run build
```

Expected: success. Bundle size shouldn't change meaningfully (~+1 KB).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/auth/types.ts frontend/src/auth/AuthContext.tsx
git commit -m "feat(auth): triggeredBy + gatedSaveSignal + wipe drafts on logout/401 (#28)"
```

---

## Task 8: Wire `QuestionCarousel` — autosave answers + draft badge

**Files:**
- Modify: `frontend/src/espejo/components/QuestionCarousel.tsx`

The carousel needs to know which sefirá it's editing (so the draft key is unique per sefirá). It also needs to:
- rehydrate the `answers` map from any persisted draft on mount,
- autosave the `answers` map on each change,
- render `PendingDraftBadge` above the question card when there's a pending draft,
- expose a `clear()` to the parent so it can wipe the draft after a successful save (Task 9 wires that up).

- [ ] **Step 1: Replace the file's content**

Replace the entire content of `frontend/src/espejo/components/QuestionCarousel.tsx` with:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';

import type { PreguntaConEstado } from '../types';
import { PendingDraftBadge, useDraftPersistence } from '../../shared/drafts';

const ease = [0.16, 1, 0.3, 1] as const;

type Props = {
  /** Sefirá id used to namespace the localStorage draft. */
  sefiraId: string;
  preguntas: PreguntaConEstado[];
  /** Called with a map of pregunta_id -> respuesta_texto. Resolves when the
   *  batch save finishes (the parent does the actual POSTs). On reject the
   *  carousel surfaces the message and stays at the save step. */
  onBatchSave: (answers: Record<string, string>) => Promise<void>;
};

export default function QuestionCarousel({ sefiraId, preguntas, onBatchSave }: Props) {
  // Only unblocked questions enter the carousel.
  const items = useMemo(() => preguntas.filter((p) => !p.bloqueada), [preguntas]);

  // Persist the in-progress answers map per sefirá. `hydrated` (set on mount)
  // seeds the initial state so a refresh or a return visit resumes where we left off.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Note: we deliberately don't destructure `clear` — the parent owns the
  // draft lifetime now (it clears after the actual POST succeeds, which only
  // happens after the user confirms the gated-save dialog).
  const { hydrated, hasPendingDraft } = useDraftPersistence(
    'espejo',
    sefiraId,
    answers,
  );

  // Apply the rehydrated draft once on mount.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (hydrated && Object.keys(hydrated).length > 0) {
      setAnswers(hydrated);
    }
  }, [hydrated]);

  // Pick the starting question: the first that doesn't yet have a non-empty
  // answer in `answers` (whether from rehydration or the running session).
  const initialIndex = useMemo(() => {
    if (items.length === 0) return 0;
    const restoredAnswers = hydrated && Object.keys(hydrated).length > 0 ? hydrated : {};
    const firstUnanswered = items.findIndex((p) => !(restoredAnswers[p.pregunta_id]?.trim()));
    return firstUnanswered === -1 ? items.length - 1 : firstUnanswered;
  }, [items, hydrated]);
  const [index, setIndex] = useState<number>(0);

  // Initialize index after items + hydration are settled.
  const indexInitRef = useRef(false);
  useEffect(() => {
    if (indexInitRef.current || items.length === 0) return;
    indexInitRef.current = true;
    setIndex(initialIndex);
  }, [initialIndex, items.length]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset session state if the underlying questions change (e.g. after save —
  // questions reload with new bloqueada flags, possibly different ids).
  const itemKey = useMemo(() => items.map((p) => p.pregunta_id).join('|'), [items]);
  const lastItemKeyRef = useRef(itemKey);
  useEffect(() => {
    if (lastItemKeyRef.current === itemKey) return;
    lastItemKeyRef.current = itemKey;
    setIndex(0);
    setAnswers({});
    setError(null);
  }, [itemKey]);

  // Autofocus textarea on each step
  useEffect(() => {
    const t = window.setTimeout(() => textareaRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [index]);

  if (items.length === 0) return null;

  const current = items[Math.min(index, items.length - 1)];
  const currentText = answers[current.pregunta_id] ?? '';
  const isLast = index >= items.length - 1;
  const canAdvance = currentText.trim().length > 0;

  function setText(v: string) {
    setAnswers((prev) => ({ ...prev, [current.pregunta_id]: v }));
    if (error) setError(null);
  }

  function goPrev() {
    if (index > 0) setIndex((i) => i - 1);
  }
  function goNext() {
    if (canAdvance && !isLast) setIndex((i) => i + 1);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      // The parent (SefiraDetailPanel) routes this through useGatedSave —
      // it resolves immediately, opens the ConfirmSaveDialog, and the actual
      // POSTs run on confirm. The parent clears the draft (via storage.ts)
      // after the POSTs succeed; we don't try to manage the draft lifetime
      // from here since we don't know if the user will confirm or cancel.
      await onBatchSave(answers);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  const progress = ((index + 1) / items.length) * 100;

  return (
    <div className="space-y-4">
      {/* Pending draft indicator */}
      {hasPendingDraft && (
        <div>
          <PendingDraftBadge visible message="Tenés respuestas sin guardar" />
        </div>
      )}

      {/* Progress header */}
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-stone-500">
        <span>Pregunta {index + 1} de {items.length}</span>
        <span className="text-stone-600">
          {Object.values(answers).filter((t) => t.trim()).length} respondidas
        </span>
      </div>
      <div className="h-[2px] w-full bg-stone-800/60 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-amber-300/70"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.32, ease }}
        />
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-stone-700/40 bg-stone-950/40 p-5 min-h-[220px] flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.pregunta_id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.28, ease }}
            className="flex-1 flex flex-col"
          >
            <p className="text-sm text-stone-200 leading-relaxed mb-3">
              {current.texto_pregunta}
            </p>
            <textarea
              ref={textareaRef}
              value={currentText}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribí tu reflexión..."
              disabled={saving}
              className="flex-1 min-h-[100px] resize-y bg-[#1b1f25] border border-stone-700/50 focus:border-amber-300/60 focus:outline-none text-sm text-stone-100 rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Error */}
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

      {/* Footer / actions */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0 || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-stone-400 hover:text-amber-200 hover:bg-stone-900/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs tracking-wide"
        >
          <ChevronLeft size={14} />
          Anterior
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={!canAdvance || saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/30 text-amber-100 text-sm tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-[0_0_14px_rgba(233,195,73,0.15)]"
          >
            <Save size={14} />
            {saving ? 'Guardando…' : 'Guardar respuestas'}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={!canAdvance || saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900/70 hover:bg-stone-900 border border-stone-800/60 hover:border-amber-300/30 text-stone-200 hover:text-amber-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs tracking-wide"
          >
            Siguiente
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* Helper text below */}
      <p className="text-[10px] text-stone-500 leading-relaxed pt-1">
        Respondé cada pregunta para avanzar. Al final del carrusel todas las respuestas
        se guardan juntas y la sefirá entra en cooldown por 30 días.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit 2>&1 | head -10
```

Expected: a single error in `SefiraDetailPanel.tsx` complaining that `QuestionCarousel` now requires a `sefiraId` prop. **This is fine — Task 9 fixes it.**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/espejo/components/QuestionCarousel.tsx
git commit -m "feat(espejo): persist carousel answers per sefirá + show pending-draft badge (#28)"
```

---

## Task 9: Wire `SefiraDetailPanel` — gated save + confirm dialog

**Files:**
- Modify: `frontend/src/espejo/components/SefiraDetailPanel.tsx`

The panel becomes the orchestrator: it captures the answers map from the carousel, wraps the POST flow with `useGatedSave`, and renders the `<ConfirmSaveDialog>` to confirm before persisting.

- [ ] **Step 1: Replace the imports block at the top of the file**

Find:

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { SefiraResumen, PreguntaConEstado, Registro } from '../types';
import SefiraHeader from './SefiraHeader';
import LastReflection from './LastReflection';
import QuestionCarousel from './QuestionCarousel';
import AnswersGridModal from './AnswersGridModal';
import HistoryList from './HistoryList';
import { apiFetch } from '../../auth';
```

Replace with:

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { SefiraResumen, PreguntaConEstado, Registro } from '../types';
import SefiraHeader from './SefiraHeader';
import LastReflection from './LastReflection';
import QuestionCarousel from './QuestionCarousel';
import AnswersGridModal from './AnswersGridModal';
import HistoryList from './HistoryList';
import { apiFetch } from '../../auth';
import { ConfirmSaveDialog, clearDraft, useGatedSave } from '../../shared/drafts';
```

- [ ] **Step 2: Replace the `handleBatchSave` function and add the gated-save state**

Find:

```ts
  async function handleBatchSave(answers: Record<string, string>) {
    const entries = Object.entries(answers).filter(([, t]) => t.trim().length > 0);
    for (const [pregunta_id, respuesta_texto] of entries) {
      const res = await apiFetch('/respuestas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta_id, respuesta_texto: respuesta_texto.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `No se pudo guardar la pregunta ${pregunta_id.slice(0, 6)}.`);
      }
    }
    // Reload the sefirá state so all questions are now blocked.
    onDataChanged();
    // Open the summary modal with what was just saved.
    setModalOpen(true);
  }
```

Replace with:

```ts
  // Pending answers snapshot. The carousel calls handleBatchSave(answers),
  // we stash the map here, then trigger the gated-save flow. The actual
  // POST happens inside performBatchSave (referenced by useGatedSave).
  const pendingAnswersRef = useRef<Record<string, string>>({});
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function performBatchSave() {
    setConfirmError(null);
    const answers = pendingAnswersRef.current;
    const entries = Object.entries(answers).filter(([, t]) => t.trim().length > 0);
    try {
      for (const [pregunta_id, respuesta_texto] of entries) {
        const res = await apiFetch('/respuestas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pregunta_id, respuesta_texto: respuesta_texto.trim() }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? `No se pudo guardar la pregunta ${pregunta_id.slice(0, 6)}.`);
        }
      }
      // Reload + open summary modal + drop the persisted draft.
      onDataChanged();
      setModalOpen(true);
      pendingAnswersRef.current = {};
      clearDraft('espejo', resumen.sefira_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar.';
      setConfirmError(msg);
      throw e; // let useGatedSave know we failed, but the dialog stays open
    }
  }

  const gated = useGatedSave(performBatchSave);

  function handleBatchSave(answers: Record<string, string>): Promise<void> {
    pendingAnswersRef.current = answers;
    setConfirmError(null);
    gated.triggerSave();
    // We resolve immediately so the carousel can drop its loading state.
    // Errors will surface inside the ConfirmSaveDialog instead.
    return Promise.resolve();
  }
```

- [ ] **Step 3: Pass the new `sefiraId` prop down to the carousel**

Find:

```tsx
          <QuestionCarousel preguntas={preguntas} onBatchSave={handleBatchSave} />
```

Replace with:

```tsx
          <QuestionCarousel sefiraId={resumen.sefira_id} preguntas={preguntas} onBatchSave={handleBatchSave} />
```

- [ ] **Step 4: Render the `<ConfirmSaveDialog>` near the existing `<AnswersGridModal>`**

Find:

```tsx
      <AnswersGridModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        preguntas={preguntas}
        resumen={resumen}
        onScoreSaved={onDataChanged}
      />
    </motion.div>
  );
}
```

Replace with:

```tsx
      <AnswersGridModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        preguntas={preguntas}
        resumen={resumen}
        onScoreSaved={onDataChanged}
      />

      <ConfirmSaveDialog
        open={gated.isConfirming}
        title="¿Guardar tus respuestas?"
        body={
          <>
            Al confirmar, tus respuestas quedan registradas y la sefirá entra en
            cooldown por <strong className="text-amber-200/90">30 días</strong>{' '}
            antes de que puedas volver a contestar estas preguntas.
          </>
        }
        confirmLabel="Guardar respuestas"
        isSaving={gated.isSaving}
        errorMessage={confirmError}
        onConfirm={() => { void gated.confirm().catch(() => { /* error already in confirmError */ }); }}
        onCancel={gated.cancel}
      />
    </motion.div>
  );
}
```

- [ ] **Step 5: Type-check + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run build
```

Expected: zero type errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/espejo/components/SefiraDetailPanel.tsx
git commit -m "feat(espejo): gated save + confirm dialog for batch reflexión POST (#28)"
```

---

## Task 10: Wire `ActivityForm` — gated save + draft persistence for new actividad

**Files:**
- Modify: `frontend/src/calendar/components/ActivityForm.tsx`

For the "new activity" flow only (no `editing` prop). Editing existing actividad bypasses the gating (the user already owns it, and PUT is direct).

- [ ] **Step 1: Read the current file to confirm the lines we'll touch**

```bash
grep -n "handleSubmit\|useState\|return " frontend/src/calendar/components/ActivityForm.tsx | head -20
```

Confirm `handleSubmit` is around line 79-113 and the JSX `return` around line 148.

- [ ] **Step 2: Add the imports at the top**

Find the imports block:

```ts
import { useEffect, useRef, useState } from 'react';
import type { SefiraNode, Activity } from '../types';
import { SEFIRA_COLORS } from '../../shared/tokens';
import RecurrencePicker from './RecurrencePicker';
import { apiFetch } from '../../auth';
```

(If the `apiFetch` import isn't there yet, add it. Recent commits should already have it from the apiFetch migration.)

Add right after, on a new line:

```ts
import { ConfirmSaveDialog, PendingDraftBadge, useDraftPersistence, useGatedSave } from '../../shared/drafts';
```

- [ ] **Step 3: Add draft persistence + gated save inside the component**

Inside the component body, after the existing `useState` calls (right after `const confirmTimer = useRef<number | null>(null);`), add:

```ts
  // Snapshot of the form fields used for both autosave and gated POST.
  // We only autosave the "create new" flow — editing is direct.
  const isNew = !editing;
  type DraftPayload = {
    title: string;
    description: string;
    date: string;
    startTime: string;
    endTime: string;
    selected: string[];
    rrule: string | null;
  };
  const formState: DraftPayload = { title, description, date, startTime, endTime, selected, rrule };

  const { hydrated: hydratedDraft, hasPendingDraft, clear: clearActivityDraft } = useDraftPersistence<DraftPayload>(
    'calendario',
    'new',
    formState,
  );

  // Apply the rehydrated draft once on mount, only when creating new.
  const draftHydratedRef = useRef(false);
  useEffect(() => {
    if (draftHydratedRef.current) return;
    if (!isNew) { draftHydratedRef.current = true; return; }
    if (!hydratedDraft) { draftHydratedRef.current = true; return; }
    draftHydratedRef.current = true;
    setTitle(hydratedDraft.title);
    setDescription(hydratedDraft.description);
    setDate(hydratedDraft.date);
    setStartTime(hydratedDraft.startTime);
    setEndTime(hydratedDraft.endTime);
    setSelected(hydratedDraft.selected);
    setRrule(hydratedDraft.rrule);
  }, [hydratedDraft, isNew]);

  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function performCreate() {
    setConfirmError(null);
    if (selected.length === 0) {
      setConfirmError('Debes seleccionar al menos una sefirá');
      throw new Error('Debes seleccionar al menos una sefirá');
    }
    const startIso = new Date(`${date}T${startTime}:00`).toISOString();
    const endIso = new Date(`${date}T${endTime}:00`).toISOString();
    const payload = {
      titulo: title,
      descripcion: description,
      inicio: startIso,
      fin: endIso,
      sefirot_ids: selected,
      rrule: rrule || undefined,
    };
    const res = await apiFetch('/actividades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: 'No se pudo guardar' }));
      const msg = data.detail ?? 'No se pudo guardar';
      setConfirmError(msg);
      throw new Error(msg);
    }
    clearActivityDraft();
    onSaved();
  }

  const gated = useGatedSave(performCreate);
```

- [ ] **Step 4: Replace `handleSubmit` to route through the gated flow for new actividades**

Find the current `handleSubmit`:

```ts
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
      const payload = {
        titulo: title,
        descripcion: description,
        inicio: startIso,
        fin: endIso,
        sefirot_ids: selected,
        rrule: rrule || undefined,
      };
      const url = editing
        ? `/actividades/${editing.id}?scope=${scope}`
        : '/actividades';
      const method = editing ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
```

Replace with:

```ts
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) {
      setError('Debes seleccionar al menos una sefirá');
      setShake(s => s + 1);
      return;
    }

    if (isNew) {
      // Gated flow: open LoginModal if anonymous, then ConfirmSaveDialog.
      setError('');
      setConfirmError(null);
      gated.triggerSave();
      return;
    }

    // Editing existing activity: direct PUT, no gate.
    setSaving(true);
    setError('');
    try {
      const startIso = new Date(`${date}T${startTime}:00`).toISOString();
      const endIso   = new Date(`${date}T${endTime}:00`).toISOString();
      const payload = {
        titulo: title,
        descripcion: description,
        inicio: startIso,
        fin: endIso,
        sefirot_ids: selected,
        rrule: rrule || undefined,
      };
      const res = await apiFetch(`/actividades/${editing.id}?scope=${scope}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
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
```

- [ ] **Step 5: Render the badge above the form and the ConfirmSaveDialog at the end**

Find the opening `<form`:

```tsx
    <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-6 space-y-6">
      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Título</label>
```

Replace with:

```tsx
    <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-6 space-y-6">
      {isNew && hasPendingDraft && (
        <div className="-mb-2">
          <PendingDraftBadge visible message="Tenés una actividad sin guardar" />
        </div>
      )}
      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Título</label>
```

Then find the closing `</form>` at the end of the return statement:

```tsx
      </div>
    </form>
  );
}
```

Replace with:

```tsx
      </div>

      <ConfirmSaveDialog
        open={gated.isConfirming}
        title="¿Crear esta actividad?"
        body={
          <>
            Vas a crear la actividad{' '}
            <strong className="text-amber-200/90">{title.trim() || 'sin título'}</strong>{' '}
            en tu agenda.
          </>
        }
        confirmLabel="Crear actividad"
        isSaving={gated.isSaving}
        errorMessage={confirmError}
        onConfirm={() => { void gated.confirm().catch(() => { /* shown in errorMessage */ }); }}
        onCancel={gated.cancel}
      />
    </form>
  );
}
```

- [ ] **Step 6: Type-check + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run build
```

Expected: zero type errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/calendar/components/ActivityForm.tsx
git commit -m "feat(calendar): gated save + draft persistence for new activity (#28)"
```

---

## Task 11: Manual sweep + final build

**Files:** none

- [ ] **Step 1: Final type-check + lint + build**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npx tsc -b --noEmit
npm run lint
npm run build
```

Expected: zero TS errors. Lint may show 2 pre-existing warnings in `SefiraDetailPanel.tsx` (the `setState`-inside-`useEffect` ones from before #28) — those are not new and not from this PR. Build clean.

- [ ] **Step 2: Boot the dev server and run through the manual matrix**

Backend (separate terminal):

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\backend"
./venv/Scripts/python.exe -m uvicorn main:app --reload
```

Frontend:

```bash
cd "c:\Users\123\Desktop\Kabbalah Space\frontend"
npm run dev
```

Open http://localhost:5173 and run through these scenarios. Tick each as you verify it.

**Scenario A — Anonymous Espejo flow:**
- [ ] Open Espejo, click any sefirá. Carousel appears, no badge yet.
- [ ] Type a reflexión for question 1 (don't go to next). Refresh the page (F5). Open the same sefirá. The textarea should show what you wrote, and the **"Tenés respuestas sin guardar"** badge appears at the top of the carousel.
- [ ] Click "Siguiente" — answer 2-3 more, then click **"Guardar respuestas"**.
- [ ] **LoginModal opens.** Loguéate (alice). After successful login, the modal closes and the **ConfirmSaveDialog** opens with the message "¿Guardar tus respuestas? … cooldown 30 días".
- [ ] Click "Guardar respuestas". The dialog shows "Guardando…", then closes. The summary `<AnswersGridModal>` opens with your saved answers.

**Scenario B — Logged-in Espejo flow:**
- [ ] Stay logged in. Open another sefirá with unanswered questions. Answer them. Click "Guardar respuestas".
- [ ] **No LoginModal.** ConfirmSaveDialog opens directly. Confirm. POST happens, summary modal opens.

**Scenario C — Anonymous Calendar flow:**
- [ ] Logout (top-right user menu). Verify `localStorage.getItem('kabbalah_drafts:calendario:new')` returns `null` in DevTools (wipeAll on logout).
- [ ] Go to Calendar. Click an empty slot to open the form. Fill title="Meditación", select sefirá Jésed, leave default times.
- [ ] **Refresh the page**. Reopen the form. Fields should be rehydrated; the "Tenés una actividad sin guardar" badge appears.
- [ ] Click "Crear actividad". LoginModal opens (because anon).
- [ ] Loguéate. ConfirmSaveDialog opens with "¿Crear esta actividad? Vas a crear la actividad **Meditación**…".
- [ ] Confirm. Activity is created, panel closes, the activity appears on the calendar.
- [ ] Verify `localStorage.getItem('kabbalah_drafts:calendario:new')` is `null` (cleared after success).

**Scenario D — Cancel preserves draft:**
- [ ] Logout. Go to Calendar, fill the form again. Click "Crear actividad". LoginModal opens.
- [ ] **Close the LoginModal** (X or ESC) without logging in. The form is still on screen with the data intact. The badge still says "Tenés una actividad sin guardar".

**Scenario E — Cross-user isolation:**
- [ ] As alice, fill a calendar form (don't save). Logout — confirm wipe.
- [ ] Login as bob. Go to Calendar, open a new form. Fields should be **empty** (no leak from alice's draft) — and no badge.

**Scenario F — Editing an actividad bypasses gating:**
- [ ] As any logged-in user, click an existing activity. The form opens with `editing` set. Change the title. Click "Guardar cambios". **No ConfirmSaveDialog**, just a direct PUT and panel closes.

If any scenario fails, stop and report the failure rather than committing further. The most likely failure modes are:
- Hydration not applying — check `useDraftPersistence` reads on mount. The `hydratedRef` pattern only fires once.
- Dialog opens but POST never happens — check that `gated.confirm()` is awaited inside the `onConfirm` handler.
- Draft survives logout — confirm `wipeAll()` runs in `logout` AND in `setUnauthorizedHandler` callback.

- [ ] **Step 3: Stop both dev servers (Ctrl+C in each terminal).**

- [ ] **Step 4: No commit — verification only.**

---

## Task 12: Push + open PR

- [ ] **Step 1: Verify the commit log**

```bash
cd "c:\Users\123\Desktop\Kabbalah Space"
git log --oneline origin/main..HEAD
```

Expected: ~10 commits, all on `feat/m6-28-frontend-gated-save`.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/m6-28-frontend-gated-save
```

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "feat(#28): gated save + draft preservation across Espejo and Calendar" --body "$(cat <<'EOF'
## Summary

Closes **#28** — Phase 2 of the privacy work (spec: \`docs/superpowers/specs/2026-05-06-privacidad-y-gated-save-design.md\`).

- New module \`frontend/src/shared/drafts/\` with five focused units:
  - \`storage.ts\` — pure localStorage layer, owner-tagged, 24h TTL for anonymous.
  - \`useDraftPersistence\` — autosave (debounced 250 ms) + rehydrate on mount.
  - \`useGatedSave\` — orchestrates "click save → maybe login → confirm → POST".
  - \`ConfirmSaveDialog\` — generic confirm modal (portal-rendered).
  - \`PendingDraftBadge\` — inline "you have an unsaved draft" indicator.
- \`AuthContext\` extended: \`openLoginModal('gated-save' | 'manual')\`, monotonic \`gatedSaveSignal\` counter that bumps once per gated-save login completion, \`adoptAnonymous(user.id)\` after login, \`wipeAll()\` on logout and on 401.
- Wired into Espejo (\`QuestionCarousel\` + \`SefiraDetailPanel\`) and Calendar (\`ActivityForm\`'s "new" flow only — editing remains direct).

## What this changes for users

- Anonymous users can write reflexiones / fill activity forms without losing what they typed on refresh.
- "Save" always opens a confirmation dialog (and a login first if anonymous), making destructive actions explicit.
- Logout clears every draft from localStorage so the next user of the browser sees nothing.

## Out of scope (follow-up)

- No automated frontend tests. The frontend has no vitest setup; adding it is its own task. Verification was via tsc + vite build + the manual scenario matrix in the plan (Task 11).
- Backend already enforces per-user privacy from #30, so this PR is purely frontend.

## Test plan

- [x] \`tsc -b --noEmit\` clean
- [x] \`vite build\` clean
- [x] Manual scenarios A–F (Anonymous Espejo, Logged-in Espejo, Anonymous Calendar, Cancel preserves draft, Cross-user isolation, Editing bypasses gating) all pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Note the PR URL** so the user can review.

---

## Done

After PR for #28 merges, M6 — Auth UX & OAuth becomes 6/7. Only #29 (Google OAuth setup docs) remains in M6.
