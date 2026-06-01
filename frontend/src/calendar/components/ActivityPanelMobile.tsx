import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { SefiraNode, Activity } from '../types';
import { useScrollLock } from '../../shared/hooks/useScrollLock';
import ActivityForm from './ActivityForm';

type Scope = 'one' | 'series';

type Props = {
  open: boolean;
  sefirot: SefiraNode[];
  editing: Activity | null;
  initialSlot: { start: Date; end: Date } | null;
  scope: Scope;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onRequestDeleteScope?: () => void;
  onActividadCreada?: (actividadId: string) => void;
};

const SHEET_HEIGHT_VH = 85;
const CLOSE_THRESHOLD_PX = 100;

export default function ActivityPanelMobile({
  open, sefirot, editing, initialSlot, scope, onClose, onSaved, onDeleted, onRequestDeleteScope, onActividadCreada,
}: Props) {
  const reduced = useReducedMotion();
  useScrollLock(open);

  // Defer mounting the form one frame after the sheet opens so the slide-up
  // animation isn't janked by RecurrencePicker/useDraftPersistence work.
  // Mirrors the desktop ActivityPanel pattern.
  const [mountForm, setMountForm] = useState(false);
  useEffect(() => {
    if (!open) {
      setMountForm(false);
      return;
    }
    const f1 = requestAnimationFrame(() => {
      const f2 = requestAnimationFrame(() => setMountForm(true));
      (window as unknown as { __panelMobileFormFrame?: number }).__panelMobileFormFrame = f2;
    });
    return () => {
      cancelAnimationFrame(f1);
      const f2 = (window as unknown as { __panelMobileFormFrame?: number }).__panelMobileFormFrame;
      if (f2) cancelAnimationFrame(f2);
    };
  }, [open]);

  const headerTitle = editing
    ? (scope === 'series' ? 'Editar toda la serie' : 'Editar actividad')
    : 'Crear actividad';

  function handleDragEnd(_: unknown, info: { offset: { y: number } }) {
    if (info.offset.y > CLOSE_THRESHOLD_PX) {
      onClose();
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="activity-sheet-overlay"
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
            key="activity-sheet"
            drag={reduced ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDragEnd}
            initial={reduced ? { y: 0 } : { y: '100%' }}
            animate={{ y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={reduced ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full bg-[#15181d] rounded-t-3xl border-t border-stone-700/45 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] flex flex-col"
            style={{ height: `${SHEET_HEIGHT_VH}vh` }}
            role="dialog"
            aria-modal="true"
            aria-label="Crear o editar actividad"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-12 h-1 rounded-full bg-stone-600" />
            </div>

            {/* Header */}
            <div className="px-5 pt-2 pb-4 flex items-start justify-between shrink-0" style={{ borderBottom: '1px solid rgba(233,195,73,0.15)' }}>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400">Gestor de actividad</p>
                <h4 className="font-serif text-xl mt-1 text-amber-100/90">{headerTitle}</h4>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full border border-stone-700 text-stone-300 hover:bg-stone-800/60 flex items-center justify-center shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto">
              {mountForm ? (
                <ActivityForm
                  sefirot={sefirot}
                  editing={editing}
                  initialSlot={initialSlot}
                  scope={scope}
                  onSaved={onSaved}
                  onCancel={onClose}
                  onDeleted={onDeleted}
                  onRequestDeleteScope={onRequestDeleteScope}
                  onActividadCreada={onActividadCreada}
                />
              ) : (
                <div className="flex-1" />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
