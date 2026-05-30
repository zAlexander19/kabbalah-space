import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';

import { useGate } from './PremiumGateContext';
import { PremiumPage } from './PremiumPage';
import { useScrollLock } from '../shared/hooks/useScrollLock';

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Full-page pricing modal — wraps PremiumPage in a backdrop + close button.
 *
 * Triggered by `useGate().openPlans()`. The PremiumGate modal "Ver planes"
 * button and any "Ver Premium" CTA in the app call it instead of changing
 * the active view, so the user keeps their place when they dismiss.
 */
export function PremiumPlansModal() {
  const { isPlansOpen, closePlans } = useGate();

  useScrollLock(isPlansOpen);

  // Escape closes
  useEffect(() => {
    if (!isPlansOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePlans();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlansOpen, closePlans]);

  return (
    <AnimatePresence>
      {isPlansOpen && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease }}
        >
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={closePlans}
            aria-hidden="true"
          />

          <motion.div
            key="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Planes Premium"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.28, ease }}
            className="relative w-full max-w-5xl max-h-[95vh] overflow-y-auto rounded-3xl bg-[#070709] border border-amber-300/20 shadow-[0_32px_96px_rgba(0,0,0,0.75)]"
          >
            <button
              type="button"
              onClick={closePlans}
              aria-label="Cerrar"
              className="sticky top-3 right-3 ml-auto z-10 flex w-9 h-9 items-center justify-center rounded-full bg-stone-900/90 hover:bg-stone-800 border border-stone-700/60 hover:border-amber-300/40 text-stone-300 hover:text-amber-100 transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
              style={{ float: 'right', marginRight: '0.75rem', marginTop: '0.75rem' }}
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                close
              </span>
            </button>

            <PremiumPage />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
