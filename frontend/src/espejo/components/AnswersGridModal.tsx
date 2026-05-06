import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import type { PreguntaConEstado } from '../types';

const ease = [0.16, 1, 0.3, 1] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  /** All questions of the sefirá (answered + unanswered). The modal renders
   *  only those with `ultima_respuesta`. */
  preguntas: PreguntaConEstado[];
  sefiraNombre: string;
};

export default function AnswersGridModal({ open, onClose, preguntas, sefiraNombre }: Props) {
  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const answered = preguntas.filter(p => !!p.ultima_respuesta);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="answers-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease }}
          className="fixed inset-0 z-[110] flex items-center justify-center px-4 py-8"
          aria-modal="true"
          role="dialog"
          aria-labelledby="answers-modal-title"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.32, ease }}
            className="relative w-full max-w-5xl max-h-[90vh] bg-stone-950/85 backdrop-blur-2xl border border-stone-800/60 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
          >
            {/* Subtle cosmic glow */}
            <div className="absolute -top-24 -right-20 w-72 h-72 bg-amber-700/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute -bottom-24 -left-20 w-72 h-72 bg-indigo-800/10 rounded-full blur-[100px] pointer-events-none" />

            {/* Close X */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-amber-200 hover:bg-stone-800/50 transition-colors"
              aria-label="Cerrar"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>

            {/* Header */}
            <div className="relative px-7 pt-7 pb-4 border-b border-stone-800/60">
              <h2
                id="answers-modal-title"
                className="font-serif text-2xl text-amber-100/90 font-light tracking-tight"
              >
                Tus respuestas
              </h2>
              <p className="text-stone-400 text-xs tracking-wide mt-1">
                {sefiraNombre} · {answered.length} {answered.length === 1 ? 'reflexión' : 'reflexiones'}
              </p>
            </div>

            {/* Grid */}
            <div className="relative px-7 py-6 overflow-y-auto">
              {answered.length === 0 ? (
                <p className="text-center text-stone-500 italic py-10">
                  Todavía no hay respuestas guardadas para esta sefirá.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {answered.map((p, i) => (
                    <AnswerCard key={p.pregunta_id} pregunta={p} delay={i * 0.04} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AnswerCard({ pregunta, delay }: { pregunta: PreguntaConEstado; delay: number }) {
  const fecha = pregunta.fecha_ultima
    ? format(parseISO(pregunta.fecha_ultima), "d 'de' MMMM", { locale: es })
    : '';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease, delay }}
      className="rounded-xl border border-stone-800/60 bg-stone-900/40 p-4 flex flex-col gap-3 hover:border-stone-700/80 transition-colors"
    >
      <p className="text-stone-100 text-sm leading-snug font-medium">
        {pregunta.texto_pregunta}
      </p>
      <p className="text-stone-300/85 text-xs leading-relaxed italic flex-1 whitespace-pre-wrap">
        {pregunta.ultima_respuesta}
      </p>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-stone-500 pt-1 border-t border-stone-800/60">
        <span>{fecha}</span>
        {pregunta.dias_restantes !== null && pregunta.dias_restantes > 0 && (
          <span className="text-amber-200/60">en {pregunta.dias_restantes}d</span>
        )}
      </div>
    </motion.div>
  );
}
