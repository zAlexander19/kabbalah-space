import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { getHistorialSnapshot, type HistorialSnapshot } from '../api';
import { SEFIRA_COLORS } from '../../shared/tokens';

const ease = [0.16, 1, 0.3, 1] as const;

type Props = {
  open: boolean;
  registroId: string | null;
  onClose: () => void;
};

export default function HistorialEntryModal({ open, registroId, onClose }: Props) {
  const [data, setData] = useState<HistorialSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Fetch snapshot when modal opens with a new registroId
  useEffect(() => {
    if (!open || !registroId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    (async () => {
      try {
        const snapshot = await getHistorialSnapshot(registroId);
        if (!cancelled) setData(snapshot);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, registroId]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="historial-overlay"
          className="fixed inset-0 z-[115] flex items-center justify-center p-2 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease }}
        >
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Reflexión histórica"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.24, ease }}
            className="relative w-full max-w-5xl max-h-[95vh] overflow-y-auto rounded-3xl bg-[#0e1014] border border-stone-700/40 shadow-[0_32px_96px_rgba(0,0,0,0.75)]"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="sticky top-3 right-3 ml-auto z-10 flex w-9 h-9 items-center justify-center rounded-full bg-stone-900/90 hover:bg-stone-800 border border-stone-700/60 hover:border-amber-300/40 text-stone-300 hover:text-amber-100 transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
              style={{ float: 'right', marginRight: '0.75rem', marginTop: '0.75rem' }}
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                close
              </span>
            </button>

            <div className="px-6 sm:px-10 py-8">
              {loading && (
                <p className="text-center text-stone-500 py-16">Cargando reflexión...</p>
              )}
              {error && (
                <p className="text-center text-red-300 py-16" role="alert">{error}</p>
              )}
              {data && (
                <>
                  {/* Header */}
                  <div className="mb-8">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-1">
                      Reflexión del {format(parseISO(data.registro.fecha_registro), "d 'de' MMMM yyyy", { locale: es })}
                    </p>
                    <h2 className="font-serif text-3xl text-amber-100/95 font-light tracking-tight">
                      {data.sefira_nombre}
                    </h2>
                  </div>

                  <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Answers area */}
                    <div className="lg:col-span-2">
                      {data.respuestas.length === 0 ? (
                        <p className="text-center text-stone-500 italic py-16">
                          No hay respuestas a preguntas guía guardadas para esta reflexión.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {data.respuestas.map((r, i) => {
                            const fecha = format(
                              parseISO(r.fecha_respuesta),
                              "d 'de' MMMM",
                              { locale: es },
                            );
                            return (
                              <motion.div
                                key={r.pregunta_id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.32, ease, delay: i * 0.04 }}
                                className="rounded-2xl border border-stone-800/60 bg-stone-900/40 p-6 flex flex-col gap-4 min-h-[200px]"
                              >
                                <p className="text-stone-100 text-base leading-snug font-medium">
                                  {r.texto_pregunta}
                                </p>
                                <p className="text-stone-300/85 text-sm leading-relaxed italic flex-1 whitespace-pre-wrap">
                                  {r.respuesta_texto}
                                </p>
                                <div className="text-[10px] uppercase tracking-[0.16em] text-stone-500 pt-3 border-t border-stone-800/60">
                                  {fecha}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Sidebar */}
                    <aside className="lg:col-span-1 space-y-6">
                      <div className="flex items-center justify-center gap-3">
                        <ScoreChip label="IA" value={data.registro.puntuacion_ia} accent="amber" />
                        <SefiraOrb sefiraId={data.sefira_id} sefiraName={data.sefira_nombre} />
                        <ScoreChip label="Usuario" value={data.registro.puntuacion_usuario} accent="stone" />
                      </div>
                      <div className="rounded-xl border border-stone-800/50 bg-stone-950/40 px-4 py-3 min-h-[64px]">
                        {data.registro.reflexion_texto ? (
                          <p className="text-stone-200/90 text-sm leading-relaxed font-serif whitespace-pre-wrap italic">
                            "{data.registro.reflexion_texto}"
                          </p>
                        ) : (
                          <p className="text-stone-500 text-xs italic text-center py-2">
                            Sin reflexión escrita.
                          </p>
                        )}
                      </div>
                    </aside>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}


function ScoreChip({ label, value, accent }: { label: string; value: number | null; accent: 'amber' | 'stone' }) {
  const colorClass = accent === 'amber' ? 'text-amber-200/90 border-amber-300/30' : 'text-stone-200 border-stone-700/60';
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border ${colorClass} bg-stone-950/40 w-20 h-16`}>
      <span className="text-[9px] uppercase tracking-[0.2em] text-stone-400">{label}</span>
      <span className="font-serif text-xl tabular-nums">{value ?? '—'}</span>
    </div>
  );
}


function SefiraOrb({ sefiraId, sefiraName }: { sefiraId: string; sefiraName: string }) {
  const color = SEFIRA_COLORS[sefiraId] ?? '#a3a3a3';
  return (
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center font-serif text-xs uppercase tracking-[0.12em] text-stone-100 shadow-[0_0_32px_rgba(255,255,255,0.08)]"
      style={{ background: `radial-gradient(circle at 30% 30%, ${color}55, ${color}22 70%, transparent)` }}
    >
      {sefiraName}
    </div>
  );
}
