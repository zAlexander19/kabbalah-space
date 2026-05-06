import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { useAuth } from './AuthContext';
import type { OAuthErrorCode } from './types';

const ease = [0.16, 1, 0.3, 1] as const;

type Tab = 'login' | 'register';

const OAUTH_ERROR_MESSAGES: Record<OAuthErrorCode, string> = {
  access_denied: 'Cancelaste el ingreso con Google.',
  missing_params: 'Faltaron parámetros en el callback de Google.',
  invalid_state: 'El token de seguridad expiró. Probá de nuevo.',
  token_exchange_failed: 'Google rechazó el código de autorización.',
  no_access_token: 'Google no devolvió un access token.',
  userinfo_failed: 'No pudimos leer tus datos de Google.',
  incomplete_profile: 'Tu cuenta de Google no tiene email o nombre disponible.',
  email_already_registered: 'Este email ya tiene cuenta. Iniciá sesión con tu contraseña.',
};

export function LoginModal() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Reset on open and focus first field
  useEffect(() => {
    if (!auth.isLoginModalOpen) return;
    setFormError(null);
    setSubmitting(false);
    // small delay so the focus lands after the entry animation
    const t = setTimeout(() => firstFieldRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [auth.isLoginModalOpen, tab]);

  // ESC closes
  useEffect(() => {
    if (!auth.isLoginModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') auth.closeLoginModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auth.isLoginModalOpen, auth]);

  const validate = (): string | null => {
    const e = email.trim();
    if (!e || !/^\S+@\S+\.\S+$/.test(e)) return 'Email inválido.';
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (tab === 'register' && nombre.trim().length === 0) return 'Decinos cómo te llamás.';
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const err = validate();
    if (err) { setFormError(err); return; }
    setSubmitting(true);
    try {
      if (tab === 'login') {
        await auth.loginWithEmail(email.trim(), password);
      } else {
        await auth.registerWithEmail(email.trim(), password, nombre.trim());
      }
      // Modal closes itself on success (AuthContext sets isLoginModalOpen=false).
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Algo salió mal.';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {auth.isLoginModalOpen && (
        <motion.div
          key="login-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          aria-modal="true"
          role="dialog"
          aria-labelledby="login-modal-title"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={auth.closeLoginModal}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.32, ease }}
            className="relative w-full max-w-md bg-stone-950/85 backdrop-blur-2xl border border-stone-800/60 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] overflow-hidden"
          >
            {/* Subtle cosmic glow */}
            <div className="absolute -top-20 -right-16 w-60 h-60 bg-amber-700/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute -bottom-20 -left-16 w-60 h-60 bg-indigo-800/10 rounded-full blur-[80px] pointer-events-none" />

            {/* Close X — z-20 so it stays clickable above the form content */}
            <button
              type="button"
              onClick={auth.closeLoginModal}
              className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-amber-200 hover:bg-stone-800/50 transition-colors"
              aria-label="Cerrar"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>

            <div className="relative p-7 pt-8">
              <h2
                id="login-modal-title"
                className="font-serif text-2xl text-amber-100/90 font-light text-center mb-1 tracking-tight"
              >
                {tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              </h2>
              <p className="text-center text-stone-400 text-xs mb-6 tracking-wide">
                Inteligencia del Ser
              </p>

              {/* Tabs */}
              <div className="flex bg-stone-900/60 border border-stone-800/60 rounded-xl p-1 mb-5">
                {(['login', 'register'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setTab(t); setFormError(null); }}
                    className={`flex-1 py-2 text-xs uppercase tracking-[0.14em] rounded-lg transition-colors ${
                      tab === t
                        ? 'bg-amber-300/15 text-amber-100 shadow-[0_0_12px_rgba(233,195,73,0.15)]'
                        : 'text-stone-500 hover:text-stone-300'
                    }`}
                  >
                    {t === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                  </button>
                ))}
              </div>

              {/* OAuth error from URL fragment */}
              {auth.oauthError && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 text-red-200 text-xs leading-relaxed">
                  {OAUTH_ERROR_MESSAGES[auth.oauthError]}
                </div>
              )}

              {/* Form error */}
              {formError && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 text-red-200 text-xs leading-relaxed">
                  {formError}
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-3">
                {tab === 'register' && (
                  <Field
                    label="Nombre"
                    type="text"
                    autoComplete="name"
                    value={nombre}
                    onChange={setNombre}
                    inputRef={firstFieldRef}
                  />
                )}
                <Field
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={setEmail}
                  inputRef={tab === 'login' ? firstFieldRef : undefined}
                />
                <Field
                  label="Contraseña"
                  type="password"
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={setPassword}
                  hint={tab === 'register' ? 'Mínimo 8 caracteres.' : undefined}
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-2 py-2.5 rounded-lg bg-amber-300/15 hover:bg-amber-300/25 active:bg-amber-300/30 border border-amber-300/30 text-amber-100 text-sm tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_18px_rgba(233,195,73,0.12)]"
                >
                  {submitting
                    ? 'Procesando…'
                    : tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-stone-800/70" />
                <span className="text-stone-500 text-[10px] uppercase tracking-[0.18em]">o</span>
                <div className="flex-1 h-px bg-stone-800/70" />
              </div>

              {/* Google button */}
              <button
                type="button"
                onClick={() => auth.googleOAuthEnabled && auth.startGoogleOAuth()}
                disabled={!auth.googleOAuthEnabled}
                title={auth.googleOAuthEnabled ? '' : 'OAuth pendiente de configurar'}
                className="w-full py-2.5 rounded-lg bg-stone-100 hover:bg-white text-stone-800 text-sm font-medium flex items-center justify-center gap-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <GoogleGlyph />
                Continuar con Google
              </button>
              {!auth.googleOAuthEnabled && (
                <p className="text-stone-500 text-[11px] text-center mt-2">
                  Google OAuth no está configurado en este backend.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface FieldProps {
  label: string;
  type: 'email' | 'password' | 'text';
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  hint?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

function Field({ label, type, value, onChange, autoComplete, hint, inputRef }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-1">
        {label}
      </span>
      <input
        ref={inputRef}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-stone-900/70 border border-stone-700/70 focus:border-amber-300/50 focus:bg-stone-900 rounded-lg px-3 py-2 text-sm text-stone-100 outline-none transition-colors placeholder:text-stone-600"
      />
      {hint && <span className="block text-[10px] text-stone-500 mt-1">{hint}</span>}
    </label>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2c-2 1.5-4.6 2.4-7.3 2.4-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.5 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.2C41 36 44 30.5 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
