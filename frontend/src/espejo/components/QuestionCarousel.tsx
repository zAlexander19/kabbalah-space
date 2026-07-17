import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';

import type { PreguntaConEstado } from '../types';
import { PendingDraftBadge, useDraftPersistence } from '../../shared/drafts';
import { useTourStep } from '../../onboarding';

const ease = [0.16, 1, 0.3, 1] as const;

type Props = {
  /** Sefirá id used to namespace the localStorage draft. */
  sefiraId: string;
  preguntas: PreguntaConEstado[];
  /** Called with a map of pregunta_id -> respuesta_texto. Resolves when the
   *  batch save finishes (the parent does the actual POSTs). On reject the
   *  carousel surfaces the message and stays at the save step. */
  onBatchSave: (answers: Record<string, string>) => Promise<void>;
};

export default function QuestionCarousel({ sefiraId, preguntas, onBatchSave }: Props) {
  // Todas las preguntas entran al carrusel (disponibles + respondidas/cooldown).
  // Las bloqueadas se muestran en modo lectura.
  const items = useMemo(() => preguntas, [preguntas]);

  // Persist the in-progress answers map per sefirá. `hydrated` (set on mount)
  // seeds the initial state so a refresh or a return visit resumes where we left off.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Note: we deliberately don't destructure `clear` — the parent owns the
  // draft lifetime now (it clears after the actual POST succeeds, which only
  // happens after the user confirms the gated-save dialog).
  const { hydrated, hasPendingDraft } = useDraftPersistence(
    'espejo',
    sefiraId,
    answers,
  );

  // Apply the rehydrated draft once on mount.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (hydrated && Object.keys(hydrated).length > 0) {
      setAnswers(hydrated);
    }
  }, [hydrated]);

  // Pick the starting question: the first that doesn't yet have a non-empty
  // answer in `answers` (whether from rehydration or the running session).
  const initialIndex = useMemo(() => {
    if (items.length === 0) return 0;
    const restoredAnswers = hydrated && Object.keys(hydrated).length > 0 ? hydrated : {};
    // Prefer the first available (non-blocked) question that doesn't yet have
    // a non-empty answer. Blocked/cooldown questions are read-only, so they're
    // not a useful landing spot.
    const firstAvailableUnanswered = items.findIndex(
      (p) => !p.bloqueada && !(restoredAnswers[p.pregunta_id]?.trim()),
    );
    if (firstAvailableUnanswered !== -1) return firstAvailableUnanswered;
    const firstAvailable = items.findIndex((p) => !p.bloqueada);
    return firstAvailable !== -1 ? firstAvailable : 0;
  }, [items, hydrated]);
  const [index, setIndex] = useState<number>(0);

  // Initialize index after items + hydration are settled.
  const indexInitRef = useRef(false);
  useEffect(() => {
    if (indexInitRef.current || items.length === 0) return;
    indexInitRef.current = true;
    setIndex(initialIndex);
  }, [initialIndex, items.length]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useTourStep(3, textareaRef);

  // Reset session state if the underlying questions change (e.g. after save —
  // questions reload with new bloqueada flags, possibly different ids).
  const itemKey = useMemo(() => items.map((p) => p.pregunta_id).join('|'), [items]);
  const lastItemKeyRef = useRef(itemKey);
  useEffect(() => {
    if (lastItemKeyRef.current === itemKey) return;
    lastItemKeyRef.current = itemKey;
    setIndex(0);
    setAnswers({});
    setError(null);
  }, [itemKey]);

  // Derived "current" state — computed here, above the autofocus effect (which
  // needs current?.bloqueada), so hook order stays stable across renders.
  // Guarded with optional chaining since items can still be empty at this
  // point (the early return sits after all hooks, below).
  const current = items[Math.min(index, items.length - 1)];
  const currentText = current ? (answers[current.pregunta_id] ?? '') : '';
  const isLast = index >= items.length - 1;
  const hasNewAnswers = Object.values(answers).some((t) => t.trim().length > 0);

  // Autofocus textarea on each step (skip for read-only/blocked cards).
  useEffect(() => {
    if (current?.bloqueada) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [index, current?.bloqueada]);

  if (items.length === 0) return null;

  function setText(v: string) {
    setAnswers((prev) => ({ ...prev, [current.pregunta_id]: v }));
    if (error) setError(null);
  }

  function goPrev() {
    if (index > 0) setIndex((i) => i - 1);
  }
  function goNext() {
    if (!isLast) setIndex((i) => i + 1);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      // The parent (SefiraDetailPanel) routes this through useGatedSave —
      // it resolves immediately, opens the ConfirmSaveDialog, and the actual
      // POSTs run on confirm. The parent clears the draft (via storage.ts)
      // after the POSTs succeed; we don't try to manage the draft lifetime
      // from here since we don't know if the user will confirm or cancel.
      await onBatchSave(answers);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  const progress = ((index + 1) / items.length) * 100;

  return (
    <div className="space-y-4">
      {/* Pending draft indicator */}
      {hasPendingDraft && (
        <div>
          <PendingDraftBadge visible message="Tenés respuestas sin guardar" />
        </div>
      )}

      {/* Progress header */}
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-stone-500">
        <span>Pregunta {index + 1} de {items.length}</span>
        <span className="text-stone-600">
          {Object.values(answers).filter((t) => t.trim()).length} respondidas
        </span>
      </div>
      <div className="h-[2px] w-full bg-stone-800/60 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-amber-300/70"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.32, ease }}
        />
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-stone-700/40 bg-stone-950/40 p-5 min-h-[220px] flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.pregunta_id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.28, ease }}
            className="flex-1 flex flex-col"
          >
            <p className="text-sm text-stone-200 leading-relaxed mb-3">
              {current.texto_pregunta}
            </p>
            {current.bloqueada ? (
              <div className="flex-1 min-h-[100px] rounded-lg border border-stone-700/40 bg-[#1b1f25]/60 px-3 py-2 space-y-2">
                {current.ultima_respuesta ? (
                  <p className="text-sm text-stone-300/80 leading-relaxed whitespace-pre-wrap">
                    {current.ultima_respuesta}
                  </p>
                ) : (
                  <p className="text-sm text-stone-500 italic">Sin respuesta registrada.</p>
                )}
                <span className="inline-block text-[10px] uppercase tracking-[0.14em] text-amber-200/70">
                  Respondida{current.dias_restantes ? ` · vuelve en ${current.dias_restantes} ${current.dias_restantes === 1 ? 'día' : 'días'}` : ''}
                </span>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={currentText}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribí tu reflexión..."
                disabled={saving}
                className="flex-1 min-h-[100px] resize-y bg-[#1b1f25] border border-stone-700/50 focus:border-amber-300/60 focus:outline-none text-sm text-stone-100 rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="text-red-400 text-[11px]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Footer / actions */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0 || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-stone-400 hover:text-amber-200 hover:bg-stone-900/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs tracking-wide"
        >
          <ChevronLeft size={14} />
          Anterior
        </button>

        <div className="flex items-center gap-2">
          {hasNewAnswers && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/30 text-amber-100 text-sm tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-[0_0_14px_rgba(233,195,73,0.15)]"
            >
              <Save size={14} />
              {saving ? 'Guardando…' : 'Guardar respuestas'}
            </button>
          )}
          {!isLast && (
            <button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900/70 hover:bg-stone-900 border border-stone-800/60 hover:border-amber-300/30 text-stone-200 hover:text-amber-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs tracking-wide"
            >
              Siguiente
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Helper text below */}
      <p className="text-[10px] text-stone-500 leading-relaxed pt-1">
        Navegá libremente entre las preguntas con Anterior / Siguiente. Guardá cuando
        quieras: las respuestas nuevas se guardan juntas y cada pregunta entra en
        cooldown por 30 días.
      </p>
    </div>
  );
}
