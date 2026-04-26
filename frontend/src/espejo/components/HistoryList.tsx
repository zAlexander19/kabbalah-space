import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Registro } from '../types';

type Props = { registros: Registro[] };

export default function HistoryList({ registros }: Props) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (registros.length <= 1) return null;
  const previous = registros.slice(1);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between rounded-xl border border-stone-700/40 bg-stone-950/30 px-4 py-3 hover:bg-stone-900/40 transition-colors"
      >
        <span className="text-xs uppercase tracking-[0.16em] text-stone-300">
          Ver historial completo ({previous.length} entradas)
        </span>
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
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-2 mt-3">
              {previous.map(r => {
                const isExp = expanded === r.id;
                const fecha = format(parseISO(r.fecha_registro), "d 'de' MMMM yyyy", { locale: es });
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setExpanded(isExp ? null : r.id)}
                    className="w-full text-left rounded-lg border border-stone-800/50 bg-stone-950/20 hover:bg-stone-900/40 px-3 py-2 transition-colors"
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-stone-300">{fecha}</span>
                      {r.puntuacion_ia !== null && (
                        <span className="text-amber-200/80 tabular-nums">IA {r.puntuacion_ia}/10</span>
                      )}
                    </div>
                    <p className={`text-xs text-stone-400 italic leading-snug ${isExp ? '' : 'line-clamp-1'}`}>
                      "{r.reflexion_texto}"
                    </p>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
