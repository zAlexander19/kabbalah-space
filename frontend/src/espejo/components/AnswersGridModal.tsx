import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import type { PreguntaConEstado, SefiraResumen } from '../types';
import ReflectionEditor from './ReflectionEditor';

const ease = [0.16, 1, 0.3, 1] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  /** All questions of the sefirá (answered + unanswered). The modal renders
   *  only those with `ultima_respuesta`. */
  preguntas: PreguntaConEstado[];
  resumen: SefiraResumen;
  /** Called after a successful score submission so the parent can refetch data. */
  onScoreSaved: () => void;
};

export default function AnswersGridModal({ open, onClose, preguntas, resumen, onScoreSaved }: Props) {
  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const answered = preguntas.filter(p => !!p.ultima_respuesta);

  // Render via portal so position: fixed escapes any transformed ancestor.
  // Without this, framer-motion `x` transforms on parent containers turn
  // `fixed` into "fixed relative to that ancestor", trapping the modal
  // inside the right column instead of covering the viewport.
  return createPortal(
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
          {/* Backdrop — light dim so the tree behind stays a bit visible */}
          <motion.div
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />

          {/* Card — sized so the page edges still peek through */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.32, ease }}
            className="relative w-[85vw] max-w-[1200px] h-[85vh] bg-stone-950/95 border border-stone-800/60 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
          >

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
                {resumen.sefira_nombre} · {answered.length} {answered.length === 1 ? 'reflexión' : 'reflexiones'}
              </p>
            </div>

            {/* Body — 2 columns of answer cards on the left, sefirá + scoring on
                the right. Stacks vertically on narrow viewports. */}
            <div className="relative flex-1 overflow-y-auto px-6 sm:px-10 py-8">
              <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Answers area — spans 2/3 of the width on lg+ */}
                <div className="lg:col-span-2">
                  {answered.length === 0 ? (
                    <p className="text-center text-stone-500 italic py-16">
                      Todavía no hay respuestas guardadas para esta sefirá.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {answered.map((p, i) => (
                        <AnswerCard key={p.pregunta_id} pregunta={p} delay={i * 0.04} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Sidebar — sefirá identity + scoring widget */}
                <aside className="lg:col-span-1 space-y-4">
                  <SefiraSidebarCard resumen={resumen} />
                  <div>
                    <h3 className="text-[10px] uppercase tracking-[0.18em] text-stone-400 mb-3">
                      Nivelación de energía
                    </h3>
                    <ReflectionEditor
                      sefiraId={resumen.sefira_id}
                      sefiraName={resumen.sefira_nombre}
                      onSaved={onScoreSaved}
                    />
                  </div>
                </aside>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function SefiraSidebarCard({ resumen }: { resumen: SefiraResumen }) {
  const score = resumen.score_ia_promedio;
  return (
    <div className="rounded-2xl border border-stone-800/60 bg-stone-900/40 p-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-1">
        Sefirá en evaluación
      </p>
      <h3 className="font-serif text-2xl text-amber-100/95 font-light tracking-tight">
        {resumen.sefira_nombre}
      </h3>
      <div className="mt-4 pt-4 border-t border-stone-800/60 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em] text-stone-500">
          Score IA promedio
        </span>
        <span className="font-serif text-xl text-amber-200/85 tabular-nums">
          {score !== null && score !== undefined
            ? <>{score.toFixed(1)}<span className="text-stone-500 text-sm">/10</span></>
            : <span className="text-stone-600 text-sm italic">sin datos</span>}
        </span>
      </div>
    </div>
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
      className="rounded-2xl border border-stone-800/60 bg-stone-900/40 p-6 flex flex-col gap-4 min-h-[200px] hover:border-stone-700/80 hover:bg-stone-900/55 transition-colors"
    >
      <p className="text-stone-100 text-base leading-snug font-medium">
        {pregunta.texto_pregunta}
      </p>
      <p className="text-stone-300/85 text-sm leading-relaxed italic flex-1 whitespace-pre-wrap">
        {pregunta.ultima_respuesta}
      </p>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-stone-500 pt-3 border-t border-stone-800/60">
        <span>{fecha}</span>
        {pregunta.dias_restantes !== null && pregunta.dias_restantes > 0 && (
          <span className="text-amber-200/60">vuelve en {pregunta.dias_restantes}d</span>
        )}
      </div>
    </motion.div>
  );
}
