import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;
const DURATION_MS = 2700;
const HOLD_MS = 400;
const WORDS = ['Despertar', 'Reflejar', 'Crecer'] as const;
const WORD_INTERVAL_MS = 900;

type Props = {
  onComplete: () => void;
};

/**
 * Full-screen loading overlay shown once per browser session before the
 * manifiesto. Counts 000→100 in 2700ms via requestAnimationFrame, rotates
 * three words at the centre, and a thin amber progress bar tracks the count.
 * When the count reaches 100, waits HOLD_MS and fires onComplete; the
 * parent unmounts this component, which fades out via AnimatePresence.
 */
export default function LoadingScreen({ onComplete }: Props) {
  const [count, setCount] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);

  // Count 000 → 100 driven by rAF so it stays smooth under load.
  useEffect(() => {
    const start = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const next = Math.min(100, Math.round((elapsed / DURATION_MS) * 100));
      setCount(next);
      if (next < 100) {
        rafId = requestAnimationFrame(tick);
      } else {
        // Hold the "100" reading for HOLD_MS then hand off to the caller.
        window.setTimeout(onComplete, HOLD_MS);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onComplete]);

  // Rotate the centre word every 900ms.
  useEffect(() => {
    const id = window.setInterval(() => {
      setWordIndex((i) => (i + 1) % WORDS.length);
    }, WORD_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const padded = count.toString().padStart(3, '0');

  return (
    <motion.div
      key="loading-screen"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease }}
      className="fixed inset-0 z-[9999] bg-[#070709]"
      role="status"
      aria-label="Cargando la bienvenida"
    >
      {/* Top-left label */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease }}
        className="absolute top-6 left-6 md:top-10 md:left-10 text-xs uppercase tracking-[0.3em] text-stone-500"
      >
        Kabbalah Space
      </motion.div>

      {/* Centre rotating word */}
      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.span
            key={WORDS[wordIndex]}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.4, ease }}
            className="font-display italic text-5xl md:text-6xl lg:text-7xl text-amber-100/80"
          >
            {WORDS[wordIndex]}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Bottom-right counter */}
      <div className="absolute bottom-10 right-6 md:bottom-14 md:right-10 font-display italic text-6xl md:text-7xl lg:text-8xl text-amber-100/90 tabular-nums">
        {padded}
      </div>

      {/* Bottom progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-stone-800/50">
        <div
          className="accent-gradient h-full origin-left"
          style={{
            transform: `scaleX(${count / 100})`,
            boxShadow: '0 0 8px rgba(233, 195, 73, 0.35)',
          }}
        />
      </div>
    </motion.div>
  );
}
