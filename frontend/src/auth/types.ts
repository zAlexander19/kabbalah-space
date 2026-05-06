export type AuthProvider = 'email' | 'google';

export interface User {
  id: string;
  email: string;
  nombre: string;
  provider: AuthProvider;
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

/**
 * Codes that the backend may return on the OAuth callback redirect, packed
 * in the URL hash (`#error=<code>`). Components should map these to user-
 * facing messages.
 */
export type OAuthErrorCode =
  | 'access_denied'           // user cancelled at Google
  | 'missing_params'
  | 'invalid_state'
  | 'token_exchange_failed'
  | 'no_access_token'
  | 'userinfo_failed'
  | 'incomplete_profile'
  | 'email_already_registered';

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  oauthError: OAuthErrorCode | null;
  clearOAuthError: () => void;

  /** True if the backend has Google OAuth credentials configured. */
  googleOAuthEnabled: boolean;

  /** Login modal state. Opened by the header button (#27) and gated actions (#28). */
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;

  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, nombre: string) => Promise<void>;
  startGoogleOAuth: () => void;
  logout: () => void;
}
