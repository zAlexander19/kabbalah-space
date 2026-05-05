import { API_BASE } from '../shared/tokens';
import type { User } from './types';

const TOKEN_KEY = 'kabbalah_auth_token';

// ---------- Token storage ----------

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* localStorage may be disabled (private mode) — silently noop */
  }
}

// ---------- 401 interceptor ----------

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

// ---------- Auth-aware fetch ----------

/**
 * Drop-in `fetch` replacement that:
 *  - Prefixes paths with API_BASE
 *  - Injects `Authorization: Bearer <token>` when a token is stored
 *  - Sets Content-Type when there's a body and none is set
 *  - On 401 with a stored token: clears the token and notifies the
 *    AuthProvider via the registered handler.
 */
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

// ---------- Endpoint wrappers ----------

interface LoginResponse {
  access_token: string;
  token_type: string;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d: { msg?: string }) => d.msg ?? '').join(', ');
    }
  } catch { /* fall through */ }
  return `HTTP ${res.status}`;
}

export async function fetchMe(): Promise<User> {
  const res = await apiFetch('/auth/me');
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function loginEmail(email: string, password: string): Promise<LoginResponse> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function registerEmail(email: string, password: string, nombre: string): Promise<User> {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nombre }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export function googleAuthorizeUrl(): string {
  return `${API_BASE}/auth/google/authorize`;
}
