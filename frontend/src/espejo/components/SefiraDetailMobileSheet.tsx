// frontend/src/espejo/components/SefiraDetailMobileSheet.tsx
//
// Bottom sheet que envuelve SefiraDetailPanel para mobile. Misma estructura
// que ActivityPanelMobile del Calendar Mobile (PR #42):
// - slide-up con spring
// - backdrop tap cierra
// - drag handle arriba
// - drag-to-close (offset.y > 100px)
// - X arriba a la izquierda
// - useScrollLock para body
// - useReducedMotion respetado

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useScrollLock } from '../../shared/hooks/useScrollLock';
import SefiraDetailPanel from './SefiraDetailPanel';
import type { SefiraResumen, PreguntaConEstado, Registro } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
  resumen: SefiraResumen | null;
  description: string;
  preguntas: PreguntaConEstado[];
  registros: Registro[];
  onDataChanged: () => void;
};

const SHEET_HEIGHT_VH = 92;
const CLOSE_THRESHOLD_PX = 100;

export default function SefiraDetailMobileSheet({
  open,
  onClose,
  resumen,
  description,
  preguntas,
  registros,
  onDataChanged,
}: Props) {
  const reduced = useReducedMotion();
  useScrollLock(open);

  function handleDragEnd(_: unknown, info: { offset: { y: number } }) {
    if (info.offset.y > CLOSE_THRESHOLD_PX) onClose();
  }

  return createPortal(
    <AnimatePresence>
      {open && resumen && (
        <motion.div
          key="sefira-sheet-overlay"
          className="fixed inset-0 z-[90] flex items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="sefira-sheet"
            drag={reduced ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDragEnd}
            initial={reduced ? { y: 0 } : { y: '100%' }}
            animate={{ y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={reduced ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full bg-[#15181d] rounded-t-3xl border-t border-stone-800/60 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] flex flex-col"
            style={{ height: `${SHEET_HEIGHT_VH}vh` }}
            role="dialog"
            aria-modal="true"
            aria-label={`Detalle de ${resumen.sefira_nombre}`}
          >
            {/* Drag handle */}
            <div className="shrink-0 flex justify-center pt-3 pb-1">
              <div className="w-12 h-1 rounded-full bg-stone-600" />
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute top-3 left-3 w-9 h-9 flex items-center justify-center rounded-full bg-stone-900/80 hover:bg-stone-800 text-stone-300 z-10"
            >
              <X size={18} />
            </button>

            {/* Sheet content — scroleable adentro */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
              <SefiraDetailPanel
                resumen={resumen}
                description={description}
                preguntas={preguntas}
                registros={registros}
                onDataChanged={onDataChanged}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
