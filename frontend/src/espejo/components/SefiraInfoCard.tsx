import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { SEFIROT_CONTENIDO } from '../sefirotContent';
import { useSefirotContenido } from '../useSefirotContenido';

type Props = { sefiraId: string };

const ease = [0.16, 1, 0.3, 1] as const;

export default function SefiraInfoCard({ sefiraId }: Props) {
  const remoto = useSefirotContenido();
  const [open, setOpen] = useState(true);
  const contenido = remoto[sefiraId] ?? SEFIROT_CONTENIDO[sefiraId];
  if (!contenido) return null;

  const hasEsencia = Boolean(contenido.esencia);
  const hasPalabrasClave = contenido.palabrasClave.length > 0;
  const hasQueObserva = Boolean(contenido.queObserva);
  const hasContenido = hasEsencia || hasPalabrasClave || hasQueObserva;
  if (!hasContenido) return null;

  return (
    <div className="rounded-2xl border border-stone-700/40 bg-stone-950/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
          Sobre esta dimensión
        </span>
        <ChevronDown
          size={16}
          className={`text-stone-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease }}
          >
            <div className="px-4 pb-4 space-y-3">
              {hasEsencia && (
                <p className="text-sm text-stone-300/90 leading-relaxed">{contenido.esencia}</p>
              )}
              {hasPalabrasClave && (
                <div className="flex flex-wrap gap-1.5">
                  {contenido.palabrasClave.map((k) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded-full bg-amber-300/10 border border-amber-300/25 text-amber-100/90 text-[10px] tracking-wide"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
              {hasQueObserva && (
                <div className="pt-1">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500 mb-1">
                    Qué observar
                  </p>
                  <p className="text-sm text-stone-300/80 leading-relaxed">{contenido.queObserva}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
