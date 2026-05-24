import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { apiFetch } from '../../auth';

type Result = {
  ai_score: number | null;
  feedback: string;
};

type Props = {
  sefiraId: string;
  /** True when the sefirá has at least one answered question this user can be evaluated on. */
  hasAnswers: boolean;
};

export default function IaRespuestasDiagnostic({ sefiraId, hasAnswers }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDiagnose() {
    if (!hasAnswers || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch('/ia/respuestas/evaluar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sefira_id: sefiraId }),
      });
      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        const detail = typeof body.detail === 'string' ? body.detail : 'No hay respuestas para evaluar.';
        setError(detail);
        return;
      }
      if (!res.ok) {
        setError('No pudimos contactar a KSpace-AI en este momento.');
        return;
      }
      const data: Result = await res.json();
      setResult(data);
    } catch {
      setError('No pudimos contactar a KSpace-AI en este momento.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-700/40 bg-stone-950/30 p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-xs uppercase tracking-[0.16em] text-stone-400 flex items-center gap-1.5">
            <Sparkles size={12} className="text-amber-200/80" />
            Diagnóstico KSpace-AI
          </h4>
          <p className="text-[10px] text-stone-500 mt-1">
            La IA lee tus respuestas a las preguntas guía y devuelve un score + observación.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleDiagnose()}
          disabled={!hasAnswers || loading}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-300/15 hover:bg-amber-300/25 disabled:bg-stone-900/40 disabled:cursor-not-allowed border border-amber-300/30 disabled:border-stone-700/40 text-amber-100 disabled:text-stone-500 text-xs tracking-wide transition-colors"
        >
          {loading ? 'Diagnosticando…' : 'Diagnosticar mis respuestas'}
        </button>
      </div>

      {!hasAnswers && (
        <p className="text-[11px] text-stone-500 italic">
          Cuando contestes al menos una pregunta guía vas a poder pedir el diagnóstico.
        </p>
      )}

      <AnimatePresence mode="wait">
        {error && (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-red-300/90"
          >
            {error}
          </motion.p>
        )}
        {result && !error && (
          <motion.div
            key="res"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-4"
          >
            {result.ai_score !== null ? (
              <>
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="font-serif text-3xl text-amber-200/95 tabular-nums">
                    {result.ai_score.toFixed(1)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 border border-stone-700/50 px-2 py-0.5 rounded">
                    Score KSpace-AI
                  </span>
                </div>
                <p className="text-sm text-stone-300/90 leading-relaxed font-serif">{result.feedback}</p>
              </>
            ) : (
              <p className="text-sm text-stone-300/90 leading-relaxed font-serif">{result.feedback}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
