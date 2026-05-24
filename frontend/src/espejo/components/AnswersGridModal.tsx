import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import type { PreguntaConEstado, SefiraResumen, Registro } from '../types';
import ReflectionEditor from './ReflectionEditor';
import { SEFIRA_COLORS } from '../../shared/tokens';

const ease = [0.16, 1, 0.3, 1] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  /** All questions of the sefirá (answered + unanswered). The modal renders
   *  only those with `ultima_respuesta`. */
  preguntas: PreguntaConEstado[];
  resumen: SefiraResumen;
  registros: Registro[];
  /** Called after a successful score submission so the parent can refetch data. */
  onScoreSaved: () => void;
};

export default function AnswersGridModal({ open, onClose, preguntas, resumen, registros, onScoreSaved }: Props) {
  // Latest registro with a user score / reflexión written.
  const latestUserEntry = registros.find(r => r.reflexion_texto !== null && r.puntuacion_usuario !== null);
  const latestUserScore = latestUserEntry?.puntuacion_usuario ?? null;
  const latestReflexion = latestUserEntry?.reflexion_texto ?? null;

  // Latest registro with an IA score (regardless of whether it has text).
  const latestIaEntry = registros.find(r => r.puntuacion_ia !== null);
  const latestIaScore = latestIaEntry?.puntuacion_ia ?? null;

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

            {/* Header — "Tus respuestas" left, sefirá name right */}
            <div className="relative px-7 pt-7 pb-4 border-b border-stone-800/60 flex items-baseline justify-between gap-4">
              <div>
                <h2
                  id="answers-modal-title"
                  className="font-serif text-2xl text-amber-100/90 font-light tracking-tight"
                >
                  Tus respuestas
                </h2>
                <p className="text-stone-400 text-xs tracking-wide mt-1">
                  {answered.length} {answered.length === 1 ? 'reflexión' : 'reflexiones'}
                </p>
              </div>
              <h3 className="font-serif text-3xl text-amber-100/95 font-light tracking-tight">
                {resumen.sefira_nombre}
              </h3>
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

                {/* Sidebar — scores flanking the orb, reflexión, then input */}
                <aside className="lg:col-span-1 space-y-6">
                  {/* Display block: scores flanking the orb + reflection below */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3">
                      <ScoreChip label="IA" value={latestIaScore} accent="amber" />
                      <SefiraOrb sefiraId={resumen.sefira_id} sefiraName={resumen.sefira_nombre} />
                      <ScoreChip label="Usuario" value={latestUserScore} accent="stone" />
                    </div>
                    <div className="rounded-xl border border-stone-800/50 bg-stone-950/40 px-4 py-3 min-h-[64px]">
                      {latestReflexion ? (
                        <p className="text-stone-200/90 text-sm leading-relaxed font-serif whitespace-pre-wrap italic">
                          "{latestReflexion}"
                        </p>
                      ) : (
                        <p className="text-stone-500 text-xs italic text-center py-2">
                          Aún sin reflexión escrita.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="h-px bg-stone-800/60" />

                  {/* Input block: ReflectionEditor for writing the next reflection */}
                  <div>
                    <h3 className="text-[10px] uppercase tracking-[0.18em] text-stone-400 mb-3 text-center">
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

function SefiraOrb({ sefiraId, sefiraName }: { sefiraId: string; sefiraName: string }) {
  const color = SEFIRA_COLORS[sefiraId] ?? '#a3a3a3';
  return (
    <div className="flex justify-center pt-2">
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${color}ff 0%, ${color}aa 60%, ${color}55 100%)`,
          border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: `inset -8px -8px 16px rgba(0,0,0,0.6), inset 8px 8px 16px rgba(255,255,255,0.3), 0 0 24px ${color}aa, 0 0 48px ${color}55`,
        }}
        title={sefiraName}
      >
        <span className="text-[10px] font-bold tracking-widest text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {sefiraName.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function ScoreChip({ label, value, accent }: {
  label: string;
  value: number | null;
  accent: 'amber' | 'stone';
}) {
  const colorClasses = accent === 'amber'
    ? 'border-amber-300/40 bg-amber-300/10 text-amber-100'
    : 'border-stone-700/60 bg-stone-900/40 text-stone-200';
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border px-3 py-2 min-w-[64px] ${colorClasses}`}>
      <span className="text-[9px] uppercase tracking-[0.18em] text-stone-400">{label}</span>
      <span className="font-serif text-xl tabular-nums leading-tight mt-0.5">
        {value !== null ? value.toFixed(1) : '—'}
      </span>
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
