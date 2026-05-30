import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import type { PreguntaConEstado, SefiraResumen, Registro } from '../types';
import ReflectionEditor from './ReflectionEditor';
import { ReflexionLibreEditor } from '../ReflexionLibreEditor';
import { SEFIRA_COLORS } from '../../shared/tokens';
import { apiFetch } from '../../auth';
import { usePremium } from '../../premium/usePremium';
import { useGate } from '../../premium/PremiumGateContext';
import { useScrollLock } from '../../shared/hooks/useScrollLock';
import { duplicarRespuesta, forzarRespuesta } from '../api';

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

  // Si ya hay una reflexión guardada, el form arranca oculto. El usuario
  // puede abrirlo manualmente con el botón "Hacer otra reflexión" (solo
  // premium), y se vuelve a cerrar después de guardar.
  const [editorOpen, setEditorOpen] = useState(false);
  const [libreOpen, setLibreOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Modo edit: cada AnswerCard se vuelve un form con textarea con la respuesta
  // vieja prellenada. Las acciones globales del panel pasan al footer.
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { isPremium } = usePremium();
  const gate = useGate();

  useScrollLock(open);
  useScrollLock(confirmOpen);

  // Stable callback so memoized AnswerCard children don't re-render on every keystroke.
  const handleDraftChange = useCallback((preguntaId: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [preguntaId]: value }));
  }, []);

  function handleHacerOtra() {
    if (isPremium) {
      // Premium: mostrar confirm primero. Tras aceptar, se entra en modo edit.
      setConfirmOpen(true);
    } else {
      // Free: cerrar este modal primero (su z-index 110 tapa al modal de planes
      // que vive en z-90) y luego abrir los planes.
      onClose();
      gate.openPlans();
    }
  }

  function confirmContinue() {
    setConfirmOpen(false);
    // Inicializar drafts con las respuestas viejas para cada pregunta
    const initial: Record<string, string> = {};
    for (const p of preguntas) {
      if (p.ultima_respuesta) initial[p.pregunta_id] = p.ultima_respuesta;
    }
    setDrafts(initial);
    setSaveError(null);
    setEditMode(true);
    // Abrir tambien el editor del sidebar para que TODO el ciclo (respuestas
    // editables + reflexion + score) se vea de una sola pantalla.
    setEditorOpen(true);
  }

  function exitEditMode() {
    setEditMode(false);
    setDrafts({});
    setSaveError(null);
  }

  async function handleMantener() {
    // Duplica TODAS las respuestas previas (mismo texto, fecha de hoy).
    // El editor de reflexión + nivelación ya está visible en el sidebar
    // desde que entró al modo edit.
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const targets = preguntas.filter((p) => p.ultima_respuesta);
      for (const p of targets) {
        await duplicarRespuesta(p.pregunta_id);
      }
      // Salimos del modo edit (deja las cards en lectura) pero NO cerramos
      // editorOpen: dejamos el editor del sidebar disponible para que el usuario
      // escriba su reflexión + score y cierre el ciclo.
      setEditMode(false);
      setDrafts({});
      onScoreSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleGuardarTodas() {
    // Para cada pregunta:
    // - Si el draft cambió respecto a la respuesta vieja → forzar (nueva respuesta)
    // - Si no cambió → duplicar (mantener la vieja en nuevo ciclo)
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      for (const p of preguntas) {
        const draft = (drafts[p.pregunta_id] ?? '').trim();
        const original = (p.ultima_respuesta ?? '').trim();
        if (!original && !draft) continue;
        if (draft && draft !== original) {
          await forzarRespuesta(p.pregunta_id, draft);
        } else if (original) {
          await duplicarRespuesta(p.pregunta_id);
        }
      }
      setEditMode(false);
      setDrafts({});
      onScoreSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  // Cada vez que cambia la sefirá (modal se abre con otra sefira), volvemos
  // a colapsar el editor.
  useEffect(() => { setEditorOpen(false); }, [resumen.sefira_id]);

  // Si el usuario tiene respuestas guardadas pero todavía no hay score de IA
  // para esta sefirá, disparar la evaluación al abrir el modal. El ref guarda
  // el set de (sefira+timestamp) ya disparadas para no llamar dos veces en una
  // misma apertura; si vuelve a abrirse el modal y sigue sin score, reintenta.
  const lastFireRef = useRef<{ sefiraId: string; at: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    if (latestIaScore !== null) return;
    if (preguntas.every(p => !p.ultima_respuesta)) return;
    // Evitar llamadas duplicadas dentro de los últimos 5s (ej. doble render
    // por StrictMode). Si pasó más tiempo y todavía no hay score, reintenta.
    const now = Date.now();
    if (
      lastFireRef.current
      && lastFireRef.current.sefiraId === resumen.sefira_id
      && now - lastFireRef.current.at < 5000
    ) return;
    lastFireRef.current = { sefiraId: resumen.sefira_id, at: now };
    void apiFetch('/ia/respuestas/evaluar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sefira_id: resumen.sefira_id }),
    })
      .then(() => onScoreSaved())
      .catch(() => { /* silent: la IA es accesorio */ });
  }, [open, resumen.sefira_id, latestIaScore, preguntas, onScoreSaved]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const answered = preguntas.filter(p => !!p.ultima_respuesta);

  // Premium cooldown semanal: máximo días que faltan antes de que TODAS las
  // preguntas vuelvan a estar disponibles. Si > 0, "Hacer otra reflexión"
  // todavía no puede invocarse (el backend devolvería 409). La cadencia
  // semanal mantiene 1 punto por semana en los gráficos de Mi Evolución.
  const cooldownDiasRestantes = answered.reduce((max, p) => {
    const d = p.dias_restantes ?? 0;
    return d > max ? d : max;
  }, 0);
  const cooldownActivo = cooldownDiasRestantes > 0;

  // Render via portal so position: fixed escapes any transformed ancestor.
  // Without this, framer-motion `x` transforms on parent containers turn
  // `fixed` into "fixed relative to that ancestor", trapping the modal
  // inside the right column instead of covering the viewport.
  return createPortal(
    <>
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
                      {(editMode ? preguntas : answered).map((p, i) => (
                        <AnswerCard
                          key={p.pregunta_id}
                          pregunta={p}
                          delay={i * 0.04}
                          editable={editMode}
                          draft={drafts[p.pregunta_id]}
                          onDraftChange={handleDraftChange}
                          disabled={saving}
                        />
                      ))}
                    </div>
                  )}

                  {editMode && (
                    <div className="mt-6 pt-6 border-t border-stone-800/60 space-y-4">
                      {saveError && (
                        <p className="text-red-300 text-sm text-center" role="alert">
                          {saveError}
                        </p>
                      )}
                      <div className="flex flex-col sm:flex-row gap-3 justify-end">
                        <button
                          type="button"
                          onClick={exitEditMode}
                          disabled={saving}
                          className="px-5 py-2.5 rounded-full text-stone-400 hover:text-stone-200 text-xs tracking-wide transition-colors disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleMantener}
                          disabled={saving}
                          className="px-5 py-2.5 rounded-full bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-xs tracking-wide transition-colors disabled:opacity-60 disabled:cursor-wait"
                        >
                          {saving ? 'Guardando...' : 'Mantener respuestas previas'}
                        </button>
                        <button
                          type="button"
                          onClick={handleGuardarTodas}
                          disabled={saving}
                          className="px-5 py-2.5 rounded-full bg-amber-300/20 hover:bg-amber-300/30 border border-amber-300/50 text-amber-50 text-xs tracking-wide transition-colors disabled:opacity-60 disabled:cursor-wait"
                        >
                          {saving ? 'Guardando...' : 'Guardar y continuar'}
                        </button>
                      </div>
                      <p className="text-[10px] text-stone-500 text-center italic">
                        El panel de la derecha también está abierto: escribí tu nueva reflexión y ajustá el nivel de la sefirá ahí mismo.
                      </p>
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

                  {/* Input block — solo si NO hay reflexión guardada, o si el
                      usuario eligió escribir una nueva. Después de guardar, se
                      vuelve a ocultar (el onSaved bajara editorOpen). */}
                  {!latestReflexion || editorOpen ? (
                    <>
                      <div className="h-px bg-stone-800/60" />
                      <div>
                        <h3 className="text-[10px] uppercase tracking-[0.18em] text-stone-400 mb-3 text-center">
                          Nivelación de energía
                        </h3>
                        <ReflectionEditor
                          sefiraId={resumen.sefira_id}
                          sefiraName={resumen.sefira_nombre}
                          onSaved={() => {
                            setEditorOpen(false);
                            onScoreSaved();
                          }}
                        />
                      </div>
                    </>
                  ) : isPremium && cooldownActivo ? (
                    <>
                      <div className="h-px bg-stone-800/60" />
                      <div className="rounded-xl border border-stone-700/40 bg-stone-950/40 px-4 py-3 text-center">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-amber-200/70 mb-1">
                          Próxima reflexión
                        </p>
                        <p className="text-stone-200 text-sm leading-snug">
                          En {cooldownDiasRestantes} {cooldownDiasRestantes === 1 ? 'día' : 'días'}
                        </p>
                        <p className="text-[10px] text-stone-500 italic mt-2 leading-snug">
                          Cadencia semanal — una reflexión por semana mantiene tu progreso visible en Mi Evolución.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="h-px bg-stone-800/60" />
                      <button
                        type="button"
                        onClick={handleHacerOtra}
                        className="w-full rounded-xl bg-gradient-to-r from-amber-200/95 to-amber-100 text-stone-900 font-semibold text-xs uppercase tracking-[0.18em] py-3.5 px-4 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                      >
                        <span>Hacer otra reflexión</span>
                        {!isPremium && <ModalPremiumPill />}
                      </button>
                      <p className="text-[10px] text-stone-500 text-center italic">
                        {isPremium
                          ? 'Iniciá un nuevo ciclo: respuestas + reflexión + nivelación.'
                          : 'Disponible con Premium. Te lleva a escribir una reflexión libre sobre esta sefirá.'}
                      </p>
                    </>
                  )}
                </aside>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    <AnimatePresence>
      {confirmOpen && (
        <motion.div
          key="confirm-overlay"
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setConfirmOpen(false)}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-otra-title"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.22, ease }}
            className="relative w-full max-w-md rounded-2xl bg-stone-950/95 border border-amber-300/20 shadow-[0_24px_80px_rgba(0,0,0,0.6)] p-7"
          >
            <h3
              id="confirm-otra-title"
              className="font-serif text-xl text-amber-100/95 mb-3"
            >
              ¿Querés volver a reflexionar sobre esta dimensión?
            </h3>
            <p className="text-stone-300 text-sm leading-relaxed mb-6">
              Tus respuestas anteriores quedarán guardadas como histórico. Vas
              a poder escribir una nueva reflexión sobre <strong>{resumen.sefira_nombre}</strong>.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-full text-stone-400 hover:text-stone-200 text-xs tracking-wide transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmContinue}
                className="px-5 py-2 rounded-full bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/40 text-amber-100 text-xs tracking-wide transition-colors"
              >
                Sí, continuar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    <ReflexionLibreEditor
      open={libreOpen}
      tipo="sefira"
      sefiraId={resumen.sefira_id}
      onClose={() => setLibreOpen(false)}
      onSaved={() => onScoreSaved()}
    />
    </>,
    document.body
  );
}

const SefiraOrb = memo(function SefiraOrb({ sefiraId, sefiraName }: { sefiraId: string; sefiraName: string }) {
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
});

const ScoreChip = memo(function ScoreChip({ label, value, accent }: {
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
});

function ModalPremiumPill() {
  return (
    <span
      className="shrink-0 text-[9px] uppercase tracking-[0.18em] font-medium text-stone-950 bg-gradient-to-br from-amber-200 via-amber-300 to-amber-400 rounded-full px-2.5 py-[2px] shadow-[0_1px_6px_rgba(233,195,73,0.4)] ring-1 ring-amber-200/40"
    >
      Premium
    </span>
  );
}

interface AnswerCardProps {
  pregunta: PreguntaConEstado;
  delay: number;
  editable?: boolean;
  draft?: string;
  onDraftChange?: (preguntaId: string, value: string) => void;
  disabled?: boolean;
}

const AnswerCard = memo(function AnswerCard({ pregunta, delay, editable, draft, onDraftChange, disabled }: AnswerCardProps) {
  const fecha = pregunta.fecha_ultima
    ? format(parseISO(pregunta.fecha_ultima), "d 'de' MMMM", { locale: es })
    : '';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease, delay }}
      className={`rounded-2xl border ${editable ? 'border-amber-300/30 bg-stone-900/50' : 'border-stone-800/60 bg-stone-900/40 hover:border-stone-700/80 hover:bg-stone-900/55'} p-6 flex flex-col gap-4 min-h-[200px] transition-colors`}
    >
      <p className="text-stone-100 text-base leading-snug font-medium">
        {pregunta.texto_pregunta}
      </p>
      {editable ? (
        <>
          {pregunta.ultima_respuesta && (
            <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">
              Respuesta anterior — {fecha}
            </p>
          )}
          <textarea
            value={draft ?? ''}
            onChange={(e) => onDraftChange?.(pregunta.pregunta_id, e.target.value)}
            disabled={disabled}
            placeholder={pregunta.ultima_respuesta ?? 'Escribí tu respuesta...'}
            rows={5}
            className="w-full bg-stone-950/60 border border-stone-800/70 focus:border-amber-300/50 rounded-xl p-3 text-stone-100 text-sm leading-relaxed italic outline-none transition-colors disabled:opacity-50 resize-y"
          />
        </>
      ) : (
        <>
          <p className="text-stone-300/85 text-sm leading-relaxed italic flex-1 whitespace-pre-wrap">
            {pregunta.ultima_respuesta}
          </p>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-stone-500 pt-3 border-t border-stone-800/60">
            <span>{fecha}</span>
            {pregunta.dias_restantes !== null && pregunta.dias_restantes > 0 && (
              <span className="text-amber-200/60">vuelve en {pregunta.dias_restantes}d</span>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
});
