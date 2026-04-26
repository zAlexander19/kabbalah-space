import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Registro } from '../types';

type Props = { registro: Registro };

export default function LastReflection({ registro }: Props) {
  const [open, setOpen] = useState(false);
  const fecha = format(new Date(registro.fecha_registro), "d 'de' MMMM", { locale: es });

  return (
    <div className="rounded-xl border border-stone-700/40 bg-stone-950/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-900/40 transition-colors"
      >
        <div className="flex items-center gap-3 text-sm text-stone-200">
          <span className="text-[10px] uppercase tracking-[0.16em] text-amber-200/80">Tu última reflexión</span>
          <span className="text-stone-500">·</span>
          <span className="text-stone-400">{fecha}</span>
          {registro.puntuacion_ia !== null && (
            <>
              <span className="text-stone-500">·</span>
              <span className="text-amber-200/80">IA {registro.puntuacion_ia}/10</span>
            </>
          )}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }}>
          <ChevronDown size={16} className="text-stone-400" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 text-sm text-stone-300/90 italic leading-relaxed border-t border-stone-800/50 pt-3">
              "{registro.reflexion_texto}"
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
