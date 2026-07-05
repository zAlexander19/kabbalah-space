import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useGate } from './PremiumGateContext';
import { PREMIUM_HIGHLIGHTS } from './gateCopy';
import { usePremium } from './usePremium';
import { useScrollLock } from '../shared/hooks/useScrollLock';

const ease = [0.16, 1, 0.3, 1] as const;

// Aparece una vez por entrada a la app (cada carga de página), tras un rato
// de uso. Sin cooldown entre días: si el usuario entra 3 veces, lo ve 3 veces.
// El único freno es el delay en-app (que se vea que hubo uso, no un pop seco
// al abrir).
const SHOW_DELAY_MS = 45_000;
const RECHECK_MS = 15_000;

interface Props {
  /** El caller (App) sabe cuándo NO molestar: tour activo, intro, login
   * modal abierto, vistas admin/cuenta. */
  suppressed: boolean;
}

/**
 * Popup promocional de Premium para usuarios free/anónimos.
 *
 * Aparece 45s después de entrar a la app, una vez por carga de página,
 * muestra qué ofrece Premium y deriva al modal de planes. Nunca se muestra
 * a usuarios premium ni encima de otro modal.
 */
export function PremiumPromoPopup({ suppressed }: Props) {
  const { openPlans, isPlansOpen, isOpen: isGateOpen } = useGate();
  const { isPremium, status } = usePremium();
  const [visible, setVisible] = useState(false);
  const reducedMotion = useReducedMotion();
  const ctaRef = useRef<HTMLButtonElement>(null);
  // Se setea en un effect (no en render) para cumplir react-hooks/purity.
  const mountedAt = useRef<number>(0);
  // Una vez por carga de página (in-memory, no persiste): evita que reaparezca
  // cada 15s tras cerrarlo, pero un reload/reingreso lo vuelve a disparar.
  const shownThisLoad = useRef(false);

  const blocked = suppressed || isPlansOpen || isGateOpen;

  useScrollLock(visible);

  useEffect(() => {
    if (mountedAt.current === 0) mountedAt.current = Date.now();
  }, []);

  useEffect(() => {
    // status === null: todavía no sabemos el tier — no decidir con eso.
    if (visible || isPremium || status === null || shownThisLoad.current) return;

    const tryShow = () => {
      if (blocked || shownThisLoad.current) return;
      // No montar con la pestaña oculta: las animaciones (rAF) están
      // congeladas y el popup aparecería a medio renderizar al volver.
      if (document.visibilityState !== 'visible') return;
      // No montar sobre la LoadingScreen de la landing (rAF-driven; si el
      // navegador la frena, puede seguir activa mucho después del load).
      if (document.querySelector('[aria-label="Cargando la bienvenida"]')) return;
      if (mountedAt.current === 0 || Date.now() - mountedAt.current < SHOW_DELAY_MS) return;
      shownThisLoad.current = true;
      setVisible(true);
    };

    const id = window.setInterval(tryShow, RECHECK_MS);
    return () => window.clearInterval(id);
  }, [visible, isPremium, status, blocked]);

  const close = useCallback(() => setVisible(false), []);

  // Escape cierra + foco inicial en el CTA (mismo patrón que LoginModal).
  useEffect(() => {
    if (!visible) return;
    ctaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, close]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="promo-overlay"
          className="fixed inset-0 z-[85] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.2, ease }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />

          <motion.div
            key="promo-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="premium-promo-title"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 18, scale: reducedMotion ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : 10, scale: reducedMotion ? 1 : 0.98 }}
            transition={{ duration: reducedMotion ? 0 : 0.28, ease }}
            className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-stone-950/95 border border-amber-300/25 shadow-[0_24px_80px_rgba(0,0,0,0.65),0_0_40px_rgba(233,195,73,0.08)] p-7"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar"
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-amber-200 hover:bg-stone-800/50 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
            </button>

            <p className="ks-eyebrow mb-3">Premium</p>
            <h2 id="premium-promo-title" className="font-serif text-2xl text-amber-100/95 mb-2">
              Profundizá tu práctica
            </h2>
            <p className="text-stone-300 text-sm leading-relaxed mb-5">
              Las herramientas completas, para quienes ya saben que la cábala no se mira de afuera.
            </p>

            <ul className="space-y-2 mb-6">
              {PREMIUM_HIGHLIGHTS.map((h) => (
                <li key={h} className="flex items-start gap-2 text-stone-200 text-sm">
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

            <p className="text-stone-400 text-xs mb-5">
              USD 5.99/mes · o USD 59.99/año{' '}
              <span className="text-amber-200/80">(ahorrás 2 meses)</span>
            </p>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={close}
                className="px-4 py-2 rounded-full text-stone-400 hover:text-stone-200 text-xs tracking-wide transition-colors"
              >
                Ahora no
              </button>
              <button
                ref={ctaRef}
                type="button"
                onClick={() => {
                  close();
                  openPlans();
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
