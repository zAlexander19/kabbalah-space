import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { SefiraResumen, PreguntaConEstado, Registro } from '../types';
import SefiraHeader from './SefiraHeader';
import LastReflection from './LastReflection';
import QuestionCarousel from './QuestionCarousel';
import AnswersGridModal from './AnswersGridModal';
import HistoryList from './HistoryList';
import { apiFetch } from '../../auth';
import { ConfirmSaveDialog, clearDraft, useGatedSave } from '../../shared/drafts';

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

  // Pending answers snapshot. The carousel calls handleBatchSave(answers),
  // we stash the map here, then trigger the gated-save flow. The actual
  // POST happens inside performBatchSave (referenced by useGatedSave).
  const pendingAnswersRef = useRef<Record<string, string>>({});
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function performBatchSave() {
    setConfirmError(null);
    const answers = pendingAnswersRef.current;
    const entries = Object.entries(answers).filter(([, t]) => t.trim().length > 0);
    try {
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
      // Reload + open summary modal + drop the persisted draft.
      onDataChanged();
      setModalOpen(true);
      pendingAnswersRef.current = {};
      clearDraft('espejo', resumen.sefira_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar.';
      setConfirmError(msg);
      throw e; // let useGatedSave know we failed, but the dialog stays open
    }
  }

  const gated = useGatedSave(performBatchSave);

  function handleBatchSave(answers: Record<string, string>): Promise<void> {
    pendingAnswersRef.current = answers;
    setConfirmError(null);
    gated.triggerSave();
    // We resolve immediately so the carousel can drop its loading state.
    // Errors will surface inside the ConfirmSaveDialog instead.
    return Promise.resolve();
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
          <QuestionCarousel sefiraId={resumen.sefira_id} preguntas={preguntas} onBatchSave={handleBatchSave} />
        ) : (
          <AllAnsweredEmptyState
            preguntas={preguntas}
            onSeeAnswers={() => setModalOpen(true)}
          />
        )}
      </Section>

      {registros.length > 1 && (
        <Section><HistoryList registros={registros} /></Section>
      )}

      <AnswersGridModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        preguntas={preguntas}
        resumen={resumen}
        onScoreSaved={onDataChanged}
      />

      <ConfirmSaveDialog
        open={gated.isConfirming}
        title="¿Guardar tus respuestas?"
        body={
          <>
            Al confirmar, tus respuestas quedan registradas y la sefirá entra en
            cooldown por <strong className="text-amber-200/90">30 días</strong>{' '}
            antes de que puedas volver a contestar estas preguntas.
          </>
        }
        confirmLabel="Guardar respuestas"
        isSaving={gated.isSaving}
        errorMessage={confirmError}
        onConfirm={() => { void gated.confirm().catch(() => { /* error already in confirmError */ }); }}
        onCancel={gated.cancel}
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
