import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  fetchMe,
  getStoredToken,
  googleAuthorizeUrl,
  loginEmail,
  registerEmail,
  setStoredToken,
  setUnauthorizedHandler,
} from './api';
import type { AuthContextValue, AuthStatus, OAuthErrorCode, User } from './types';

const AuthContext = createContext<AuthContextValue | null>(null);

const OAUTH_RETURN_PATH = '/auth/return';
const KNOWN_OAUTH_ERRORS: ReadonlyArray<OAuthErrorCode> = [
  'access_denied',
  'missing_params',
  'invalid_state',
  'token_exchange_failed',
  'no_access_token',
  'userinfo_failed',
  'incomplete_profile',
  'email_already_registered',
];

function readReturnFragment(): { token: string | null; error: OAuthErrorCode | null } {
  if (window.location.pathname !== OAUTH_RETURN_PATH) return { token: null, error: null };
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hash) return { token: null, error: null };
  const params = new URLSearchParams(hash);
  const token = params.get('token');
  const errRaw = params.get('error');
  const error = errRaw && (KNOWN_OAUTH_ERRORS as readonly string[]).includes(errRaw)
    ? (errRaw as OAuthErrorCode)
    : null;
  return { token, error };
}

function cleanReturnUrl(): void {
  if (window.location.pathname === OAUTH_RETURN_PATH) {
    window.history.replaceState({}, '', '/');
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [oauthError, setOauthError] = useState<OAuthErrorCode | null>(null);

  // Bootstrap: handle /auth/return, then validate any stored token.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const fragment = readReturnFragment();
      if (fragment.error) {
        setOauthError(fragment.error);
        cleanReturnUrl();
        setStatus('anonymous');
        return;
      }
      if (fragment.token) {
        setStoredToken(fragment.token);
        cleanReturnUrl();
      }

      const token = getStoredToken();
      if (!token) {
        setStatus('anonymous');
        return;
      }

      try {
        const me = await fetchMe();
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        setStoredToken(null);
        setStatus('anonymous');
      }
    })();

    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('anonymous');
    });

    return () => { cancelled = true; };
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const { access_token } = await loginEmail(email, password);
    setStoredToken(access_token);
    const me = await fetchMe();
    setUser(me);
    setStatus('authenticated');
  }, []);

  const registerWithEmail = useCallback(async (email: string, password: string, nombre: string) => {
    await registerEmail(email, password, nombre);
    // Auto-login so the user lands authenticated.
    const { access_token } = await loginEmail(email, password);
    setStoredToken(access_token);
    const me = await fetchMe();
    setUser(me);
    setStatus('authenticated');
  }, []);

  const startGoogleOAuth = useCallback(() => {
    window.location.href = googleAuthorizeUrl();
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const clearOAuthError = useCallback(() => setOauthError(null), []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    oauthError,
    clearOAuthError,
    loginWithEmail,
    registerWithEmail,
    startGoogleOAuth,
    logout,
  }), [user, status, oauthError, clearOAuthError, loginWithEmail, registerWithEmail, startGoogleOAuth, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
