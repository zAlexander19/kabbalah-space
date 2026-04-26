import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { SefiraNode, Activity } from '../types';
import { panelSpring, panelExit } from '../motion/transitions';
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
};

export default function ActivityPanel({
  open, sefirot, editing, initialSlot, scope, onClose, onSaved, onDeleted, onRequestDeleteScope,
}: Props) {
  const [mountForm, setMountForm] = useState(false);

  useEffect(() => {
    if (!open) {
      setMountForm(false);
      return;
    }
    const f1 = requestAnimationFrame(() => {
      const f2 = requestAnimationFrame(() => setMountForm(true));
      (window as unknown as { __panelFormFrame?: number }).__panelFormFrame = f2;
    });
    return () => {
      cancelAnimationFrame(f1);
      const f2 = (window as unknown as { __panelFormFrame?: number }).__panelFormFrame;
      if (f2) cancelAnimationFrame(f2);
    };
  }, [open]);

  const headerTitle = editing
    ? (scope === 'series' ? 'Editar toda la serie' : 'Editar actividad')
    : 'Crear actividad';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-[#0a0a0c]/80 backdrop-blur-md"
          />
          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%', transition: panelExit }}
            transition={panelSpring}
            style={{ willChange: 'transform' }}
            className="fixed right-0 top-0 z-[70] h-full w-full max-w-[460px] bg-[#15181d] border-l border-stone-700/45 shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col"
          >
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(233,195,73,0.15)' }}>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400">Gestor de actividad</p>
                <h4 className="font-serif text-2xl mt-1 text-amber-100/90">{headerTitle}</h4>
              </div>
              <motion.button
                type="button"
                onClick={onClose}
                whileHover={{ rotate: 90 }}
                transition={{ duration: 0.22 }}
                className="w-9 h-9 rounded-full border border-stone-700 text-stone-300 hover:bg-stone-800/60 flex items-center justify-center"
                aria-label="Cerrar"
              >
                <X size={16} />
              </motion.button>
            </div>

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
              />
            ) : (
              <div className="flex-1" />
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
