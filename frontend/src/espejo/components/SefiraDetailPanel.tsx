import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { SefiraResumen, PreguntaConEstado, Registro } from '../types';
import SefiraHeader from './SefiraHeader';
import LastReflection from './LastReflection';
import QuestionCarousel from './QuestionCarousel';
import AnswersGridModal from './AnswersGridModal';
import ReflectionEditor from './ReflectionEditor';
import HistoryList from './HistoryList';
import { apiFetch } from '../../auth';

type Props = {
  resumen: SefiraResumen;
  description: string;
  preguntas: PreguntaConEstado[];
  registros: Registro[];
  onDataChanged: () => void;
};

export default function SefiraDetailPanel({ resumen, description, preguntas, registros, onDataChanged }: Props) {
  const ultima = registros[0] ?? null;

  const hasUnblocked = useMemo(() => preguntas.some(p => !p.bloqueada), [preguntas]);
  const allAnswered = preguntas.length > 0 && !hasUnblocked && preguntas.every(p => !!p.ultima_respuesta);

  const [modalOpen, setModalOpen] = useState(false);

  // Auto-open the answers modal when the user lands on a sefirá with everything
  // already answered. We track the sefira id so it doesn't keep reopening
  // after the user closes it manually.
  const [autoOpenedFor, setAutoOpenedFor] = useState<string | null>(null);
  useEffect(() => {
    if (allAnswered && autoOpenedFor !== resumen.sefira_id) {
      setModalOpen(true);
      setAutoOpenedFor(resumen.sefira_id);
    }
    if (!allAnswered && autoOpenedFor === resumen.sefira_id) {
      // Fresh state for this sefirá (e.g. some question came out of cooldown)
      setAutoOpenedFor(null);
    }
  }, [allAnswered, resumen.sefira_id, autoOpenedFor]);

  // Reset close-tracking when switching sefirá
  useEffect(() => {
    setModalOpen(false);
    setAutoOpenedFor(null);
  }, [resumen.sefira_id]);

  async function handleBatchSave(answers: Record<string, string>) {
    const entries = Object.entries(answers).filter(([, t]) => t.trim().length > 0);
    for (const [pregunta_id, respuesta_texto] of entries) {
      const res = await apiFetch('/respuestas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta_id, respuesta_texto: respuesta_texto.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `No se pudo guardar la pregunta ${pregunta_id.slice(0, 6)}.`);
      }
    }
    // Reload the sefirá state so all questions are now blocked.
    onDataChanged();
    // Open the summary modal with what was just saved.
    setModalOpen(true);
  }

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
      className="space-y-6"
    >
      <Section><SefiraHeader resumen={resumen} description={description} /></Section>

      {ultima && (
        <Section><LastReflection registro={ultima} /></Section>
      )}

      <Section>
        <div className="flex items-baseline justify-between mb-3">
          <h4 className="text-xs uppercase tracking-[0.16em] text-stone-400">Preguntas guía</h4>
          {preguntas.some(p => !!p.ultima_respuesta) && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="text-[10px] uppercase tracking-[0.14em] text-stone-500 hover:text-amber-200 transition-colors"
            >
              Ver mis respuestas
            </button>
          )}
        </div>

        {preguntas.length === 0 ? (
          <p className="text-xs text-stone-500 italic text-center py-4">
            No hay preguntas guía para esta sefirá. Agregá algunas desde el Panel de Administrador.
          </p>
        ) : hasUnblocked ? (
          <QuestionCarousel preguntas={preguntas} onBatchSave={handleBatchSave} />
        ) : (
          <AllAnsweredEmptyState
            preguntas={preguntas}
            onSeeAnswers={() => setModalOpen(true)}
          />
        )}
      </Section>

      {/* Nivelación de energía: sólo aparece cuando no quedan preguntas
          guía pendientes (todas respondidas o la sefirá no tiene preguntas
          configuradas). Es el cierre del flujo, después del carrusel. */}
      {!hasUnblocked && (
        <Section>
          <h4 className="text-xs uppercase tracking-[0.16em] text-stone-400 mb-3">
            Nivelación de energía
          </h4>
          <ReflectionEditor
            sefiraId={resumen.sefira_id}
            sefiraName={resumen.sefira_nombre}
            onSaved={onDataChanged}
          />
        </Section>
      )}

      {registros.length > 1 && (
        <Section><HistoryList registros={registros} /></Section>
      )}

      <AnswersGridModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        preguntas={preguntas}
        sefiraNombre={resumen.sefira_nombre}
      />
    </motion.div>
  );
}

function AllAnsweredEmptyState({ preguntas, onSeeAnswers }: {
  preguntas: PreguntaConEstado[];
  onSeeAnswers: () => void;
}) {
  // Soonest moment a question becomes available again
  const soonest = preguntas
    .map(p => p.dias_restantes)
    .filter((d): d is number => d !== null && d > 0)
    .sort((a, b) => a - b)[0];

  return (
    <div className="rounded-xl border border-stone-700/40 bg-stone-950/30 p-5 text-center space-y-3">
      <p className="text-sm text-stone-300">
        Ya respondiste todas las preguntas de esta sefirá.
      </p>
      {soonest !== undefined && (
        <p className="text-xs text-stone-500">
          La próxima vuelve a estar disponible en {soonest} {soonest === 1 ? 'día' : 'días'}.
        </p>
      )}
      <button
        type="button"
        onClick={onSeeAnswers}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/30 text-amber-100 text-xs tracking-wide transition-colors"
      >
        Ver mis respuestas
      </button>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={{
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}
