import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Registro } from '../types';
import HistorialEntryModal from './HistorialEntryModal';

type Props = { registros: Registro[] };

export default function HistoryList({ registros }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // registros[0] es la entrada actual (ya se renderiza arriba en el panel).
  // De las anteriores, filtrar las que tienen texto real — las que solo traen
  // puntuacion_ia (sin reflexión escrita) son evaluaciones automaticas que
  // ensucian el historial.
  const previous = registros
    .slice(1)
    .filter(r => r.reflexion_texto && r.reflexion_texto.trim().length > 0);
  if (previous.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between rounded-xl border border-stone-700/40 bg-stone-950/30 px-4 py-3 hover:bg-stone-900/40 transition-colors"
      >
        <span className="text-xs uppercase tracking-[0.16em] text-stone-300">
          Ver historial completo ({previous.length} {previous.length === 1 ? 'entrada' : 'entradas'})
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
                const fecha = format(parseISO(r.fecha_registro), "d 'de' MMMM yyyy", { locale: es });
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className="w-full text-left rounded-lg border border-stone-800/50 bg-stone-950/20 hover:bg-stone-900/60 hover:border-amber-300/30 px-3 py-2 transition-colors group"
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-stone-300">{fecha}</span>
                      <div className="flex items-center gap-2">
                        {r.puntuacion_ia !== null && (
                          <span className="text-amber-200/80 tabular-nums">IA {r.puntuacion_ia}/10</span>
                        )}
                        <span className="text-stone-500 group-hover:text-amber-200/70 text-[10px] uppercase tracking-[0.14em]">
                          Ver →
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-stone-400 italic leading-snug line-clamp-1">
                      "{r.reflexion_texto}"
                    </p>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <HistorialEntryModal
        open={selectedId !== null}
        registroId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
