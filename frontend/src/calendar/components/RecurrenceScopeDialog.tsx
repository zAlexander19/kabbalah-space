import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type Scope = 'one' | 'series';
type Mode = 'edit' | 'delete';

type Props = {
  open: boolean;
  mode: Mode;
  onChoose: (scope: Scope) => void;
  onCancel: () => void;
};

export default function RecurrenceScopeDialog({ open, mode, onChoose, onCancel }: Props) {
  const [scope, setScope] = useState<Scope>('one');

  useEffect(() => { if (open) setScope('one'); }, [open]);

  const verb = mode === 'edit' ? 'Editar' : 'Borrar';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scope-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onCancel}
            className="fixed inset-0 z-[80] bg-[#0a0a0c]/85 backdrop-blur-md"
          />
          <motion.div
            key="scope-card"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-1/2 left-1/2 z-[81] -translate-x-1/2 -translate-y-1/2 w-[min(420px,90vw)] bg-[#15181d] border border-stone-700/50 rounded-2xl p-6 shadow-2xl"
            style={{ willChange: 'transform' }}
          >
            <h4 className="font-serif text-xl text-amber-100/90 mb-1">{verb} actividad</h4>
            <p className="text-xs text-stone-400 mb-5">Esta actividad pertenece a una serie recurrente.</p>

            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-stone-700/50 hover:bg-stone-800/40 cursor-pointer">
                <input
                  type="radio"
                  name="rec-scope"
                  checked={scope === 'one'}
                  onChange={() => setScope('one')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm text-stone-100">Solo esta</p>
                  <p className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">Las demás del patrón quedan iguales</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-stone-700/50 hover:bg-stone-800/40 cursor-pointer">
                <input
                  type="radio"
                  name="rec-scope"
                  checked={scope === 'series'}
                  onChange={() => setScope('series')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm text-stone-100">Toda la serie</p>
                  <p className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">{mode === 'edit' ? 'Regenera todas las instancias' : 'Borra todas las instancias'}</p>
                </div>
              </label>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border border-stone-700 text-stone-300 text-xs uppercase tracking-[0.14em] py-2.5 hover:bg-stone-800/60 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => onChoose(scope)}
                className="flex-1 rounded-xl bg-amber-300 text-stone-900 font-semibold text-xs uppercase tracking-[0.18em] py-2.5 hover:bg-amber-200 transition-colors"
              >
                Continuar
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
