import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { SefiraNode, Activity } from '../types';
import { panelSpring, panelExit } from '../motion/transitions';
import ActivityForm from './ActivityForm';

type Props = {
  open: boolean;
  sefirot: SefiraNode[];
  editing: Activity | null;
  initialSlot: { start: Date; end: Date } | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
};

export default function ActivityPanel({ open, sefirot, editing, initialSlot, onClose, onSaved, onDeleted }: Props) {
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
            className="fixed right-0 top-0 z-[70] h-full w-full max-w-[460px] bg-[#15181d] border-l border-stone-700/45 shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col"
          >
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(233,195,73,0.15)' }}>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400">Gestor de actividad</p>
                <h4 className="font-serif text-2xl mt-1 text-amber-100/90">{editing ? 'Editar actividad' : 'Crear actividad'}</h4>
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

            <ActivityForm
              sefirot={sefirot}
              editing={editing}
              initialSlot={initialSlot}
              onSaved={onSaved}
              onCancel={onClose}
              onDeleted={onDeleted}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
