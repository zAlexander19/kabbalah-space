import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { CalendarView } from '../types';

const ORDER: Record<CalendarView, number> = { semana: 0, mes: 1, anio: 2 };

type Props = {
  view: CalendarView;
  children: ReactNode;
};

export default function ViewMorph({ view, children }: Props) {
  const reduced = useReducedMotion();
  const prevView = useRef<CalendarView>(view);

  useEffect(() => {
    prevView.current = view;
  }, [view]);

  if (reduced) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {children}
        </motion.div>
      </AnimatePresence>
    );
  }

  const goingDeeper = ORDER[view] < ORDER[prevView.current];
  const initialScale = goingDeeper ? 1.08 : 0.92;
  const initialY = goingDeeper ? -12 : 12;
  const exitScale = goingDeeper ? 0.92 : 1.08;
  const exitY = goingDeeper ? 12 : -12;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0, scale: initialScale, y: initialY }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: exitScale, y: exitY }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: 'center center' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
