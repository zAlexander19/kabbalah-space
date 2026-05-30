import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';

import { useGate } from './PremiumGateContext';
import { GATE_COPY, PREMIUM_HIGHLIGHTS } from './gateCopy';
import { useScrollLock } from '../shared/hooks/useScrollLock';

const ease = [0.16, 1, 0.3, 1] as const;

interface PremiumGateProps {
  /** Called when the user clicks "Ver planes". The caller decides routing. */
  onNavigateToPremium: () => void;
}

export function PremiumGate({ onNavigateToPremium }: PremiumGateProps) {
  const { isOpen, reason, detail, closeGate } = useGate();

  useScrollLock(isOpen);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeGate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeGate]);

  const copy = reason ? GATE_COPY[reason] : null;

  return (
    <AnimatePresence>
      {isOpen && copy && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeGate}
            aria-hidden="true"
          />

          <motion.div
            key="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="premium-gate-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease }}
            className="relative w-full max-w-md rounded-2xl bg-stone-950/95 border border-amber-300/20 shadow-[0_24px_80px_rgba(0,0,0,0.6)] p-7"
          >
            <h2
              id="premium-gate-title"
              className="font-serif text-2xl text-amber-100/95 mb-3"
            >
              {copy.title}
            </h2>
            <p className="text-stone-300 text-sm leading-relaxed mb-5">
              {copy.description(detail)}
            </p>

            <div className="border-t border-stone-800/70 pt-4 mb-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-3">
                Con Premium tenés
              </p>
              <ul className="space-y-1.5">
                {PREMIUM_HIGHLIGHTS.map((h) => (
                  <li
                    key={h}
                    className="flex items-start gap-2 text-stone-200 text-sm"
                  >
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
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeGate}
                className="px-4 py-2 rounded-full text-stone-400 hover:text-stone-200 text-xs tracking-wide transition-colors"
              >
                Ahora no
              </button>
              <button
                type="button"
                onClick={() => {
                  closeGate();
                  onNavigateToPremium();
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
