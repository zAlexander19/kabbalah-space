import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { CalendarView } from '../types';

const ORDER: Record<CalendarView, number> = { dia: -1, semana: 0, mes: 1, anio: 2 };

type Props = {
  view: CalendarView;
  children: ReactNode;
};

/**
 * Morph de entrada al cambiar de vista (semana/mes/año).
 *
 * OJO: acá NO va AnimatePresence. Este componente vive dentro del
 * AnimatePresence mode="wait" de App.tsx, y un AnimatePresence anidado que ya
 * cicló hijos (cambio de vista) deja entradas de exit que nunca completan —
 * el padre queda esperando y la navegación a otras vistas no monta nada
 * (bug conocido de framer-motion con presences anidadas + mode="wait").
 * El remount por key + initial/animate conserva el efecto morph sin esa
 * maquinaria; solo se pierde el fade-out del view saliente.
 */
export default function ViewMorph({ view, children }: Props) {
  const reduced = useReducedMotion();
  // Patrón "adjust state during render": trackea la vista anterior sin refs
  // (leer un ref en render rompe react-hooks/purity con el compiler).
  const [prevView, setPrevView] = useState<CalendarView>(view);
  const [goingDeeper, setGoingDeeper] = useState(false);
  if (prevView !== view) {
    setPrevView(view);
    setGoingDeeper(ORDER[view] < ORDER[prevView]);
  }

  if (reduced) {
    return (
      <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
        {children}
      </motion.div>
    );
  }
  const initialScale = goingDeeper ? 1.08 : 0.92;
  const initialY = goingDeeper ? -12 : 12;

  return (
    <motion.div
      key={view}
      initial={{ opacity: 0, scale: initialScale, y: initialY }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformOrigin: 'center center' }}
    >
      {children}
    </motion.div>
  );
}
