import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { useAuth } from './AuthContext';
import type { OAuthErrorCode } from './types';
import { useScrollLock } from '../shared/hooks/useScrollLock';

const ease = [0.16, 1, 0.3, 1] as const;

const OAUTH_ERROR_MESSAGES: Record<OAuthErrorCode, string> = {
  access_denied: 'Cancelaste el ingreso con Google.',
  missing_params: 'Faltaron parámetros en el callback de Google.',
  invalid_state: 'El token de seguridad expiró. Probá de nuevo.',
  token_exchange_failed: 'Google rechazó el código de autorización.',
  no_access_token: 'Google no devolvió un access token.',
  userinfo_failed: 'No pudimos leer tus datos de Google.',
  incomplete_profile: 'Tu cuenta de Google no tiene email o nombre disponible.',
  email_already_registered: 'Este email ya está asociado a otro método de acceso.',
};

/**
 * Modal de acceso — solo Google.
 *
 * El registro con email+contraseña fue eliminado: las cuentas nuevas se crean
 * exclusivamente con Google (cuentas reales). Si un email ya existía como
 * cuenta de contraseña, "Continuar con Google" la adopta (mismo Gmail).
 */
export function LoginModal() {
  const auth = useAuth();

  useScrollLock(auth.isLoginModalOpen);

  // ESC cierra
  useEffect(() => {
    if (!auth.isLoginModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') auth.closeLoginModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auth.isLoginModalOpen, auth]);

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
            className="relative w-full max-w-sm max-h-[90vh] overflow-y-auto bg-stone-950/85 backdrop-blur-2xl border border-stone-800/60 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
          >
            {/* Subtle cosmic glow — clipped en su propio wrapper */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none" aria-hidden="true">
              <div className="absolute -top-20 -right-16 w-60 h-60 bg-amber-700/10 rounded-full blur-[80px]" />
              <div className="absolute -bottom-20 -left-16 w-60 h-60 bg-indigo-800/10 rounded-full blur-[80px]" />
            </div>

            {/* Close X */}
            <button
              type="button"
              onClick={auth.closeLoginModal}
              className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-amber-200 hover:bg-stone-800/50 transition-colors"
              aria-label="Cerrar"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
            </button>

            <div className="relative p-8 pt-9 text-center">
              <h2
                id="login-modal-title"
                className="font-serif text-2xl text-amber-100/90 font-light mb-1 tracking-tight"
              >
                Entrá a Kabbalah Space
              </h2>
              <p className="text-stone-400 text-sm mb-7 tracking-wide leading-relaxed">
                Creá tu cuenta o iniciá sesión con Google.
              </p>

              {/* OAuth error from URL fragment */}
              {auth.oauthError && (
                <div className="mb-5 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 text-red-200 text-xs leading-relaxed text-left">
                  {OAUTH_ERROR_MESSAGES[auth.oauthError]}
                </div>
              )}

              {/* Google button */}
              <button
                type="button"
                onClick={() => auth.googleOAuthEnabled && auth.startGoogleOAuth()}
                disabled={!auth.googleOAuthEnabled}
                title={auth.googleOAuthEnabled ? '' : 'OAuth pendiente de configurar'}
                className="w-full py-3 rounded-lg bg-stone-100 hover:bg-white text-stone-800 text-sm font-medium flex items-center justify-center gap-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <GoogleGlyph />
                Continuar con Google
              </button>
              {!auth.googleOAuthEnabled && (
                <p className="text-stone-500 text-[11px] mt-3">
                  Google OAuth no está configurado en este backend.
                </p>
              )}

              <p className="text-stone-600 text-[11px] mt-6 leading-relaxed">
                Usamos Google para verificar que tu cuenta sea real. No publicamos nada en tu nombre.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
