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
