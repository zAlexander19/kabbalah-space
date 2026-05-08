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
