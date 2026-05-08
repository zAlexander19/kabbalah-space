import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

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
import { adoptAnonymous, wipeAll } from '../shared/drafts/storage';
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
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [lastTriggeredBy, setLastTriggeredBy] = useState<'gated-save' | 'manual' | null>(null);
  const [gatedSaveSignal, setGatedSaveSignal] = useState<number>(0);

  // Bootstrap: handle /auth/return, validate any stored token, fetch auth config.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // /auth/config — independent of token, fetch in parallel
      fetchAuthConfig()
        .then((cfg) => { if (!cancelled) setGoogleOAuthEnabled(cfg.google_oauth_enabled); })
        .catch(() => { /* leave default false */ });

      const fragment = readReturnFragment();
      if (fragment.error) {
        setOauthError(fragment.error);
        cleanReturnUrl();
        setStatus('anonymous');
        // Auto-open the modal so the user sees the error message.
        setIsLoginModalOpen(true);
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
      wipeAll();
      setUser(null);
      setStatus('anonymous');
      setIsLoginModalOpen(true);
    });

    return () => { cancelled = true; };
  }, []);

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
    if (lastTriggeredBy === 'gated-save') {
      setGatedSaveSignal((n) => n + 1);
    }
    setLastTriggeredBy(null);
  }, [lastTriggeredBy]);

  const startGoogleOAuth = useCallback(() => {
    window.location.href = googleAuthorizeUrl();
  }, []);

  const logout = useCallback(() => {
    wipeAll();
    setStoredToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const clearOAuthError = useCallback(() => setOauthError(null), []);
  const openLoginModal = useCallback((triggeredBy: 'gated-save' | 'manual' = 'manual') => {
    setLastTriggeredBy(triggeredBy);
    setIsLoginModalOpen(true);
  }, []);
  const closeLoginModal = useCallback(() => {
    setIsLoginModalOpen(false);
    setOauthError(null);
    setLastTriggeredBy(null);
  }, []);

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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
