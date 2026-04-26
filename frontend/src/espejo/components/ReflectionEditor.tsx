import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE } from '../../shared/tokens';

type Props = {
  sefiraId: string;
  sefiraName: string;
  onSaved: () => void;
};

type Feedback = { score: number; text: string };

export default function ReflectionEditor({ sefiraId, sefiraName, onSaved }: Props) {
  const [score, setScore] = useState(5);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sefira: sefiraName, sefira_id: sefiraId, text, score }),
      });
      if (res.ok) {
        const data = await res.json();
        setFeedback({ score: data.ai_score, text: data.feedback });
        onSaved();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const trackPercent = ((score - 1) / 9) * 100;

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-stone-700/40 bg-stone-950/30 p-5 space-y-5">
      <div>
        <div className="flex justify-between items-baseline mb-3">
          <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Nivelación de energía</label>
          <span className="font-serif text-2xl text-amber-200/90 tabular-nums">
            {score.toFixed(1)}<span className="text-stone-500 text-sm">/10</span>
          </span>
        </div>
        <div className="relative w-full h-1.5 bg-stone-800 rounded-full">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-stone-500 to-amber-200/80 rounded-full pointer-events-none"
            style={{ width: `${trackPercent}%`, transition: 'width 0.1s linear' }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-amber-200 border-2 border-[#070709] shadow-[0_0_10px_rgba(253,230,138,0.6)]" />
          </div>
          <input
            type="range" min={1} max={10} step={0.1} value={score}
            onChange={e => setScore(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400 block mb-2">Reflexión global</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          required
          placeholder="Detallá cómo esta energía se manifiesta en tus decisiones o bloqueos..."
          className="w-full min-h-[120px] resize-y bg-[#1b1f25] border border-stone-700/50 focus:border-amber-300/60 focus:outline-none text-sm text-stone-100 rounded-lg px-3 py-2 transition-colors"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !text.trim()}
        className="w-full rounded-xl bg-gradient-to-r from-amber-200/95 to-amber-100 text-stone-900 font-semibold text-xs uppercase tracking-[0.18em] py-3 hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {submitting ? <LoadingDots /> : 'Recibir Diagnóstico IA'}
      </button>

      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-4"
          >
            <div className="flex items-baseline gap-3 mb-3">
              <span className="font-serif text-3xl text-amber-200/95">{feedback.score.toFixed(1)}</span>
              <span className="text-[10px] uppercase tracking-wider text-stone-400 border border-stone-700/50 px-2 py-0.5 rounded">
                Score Coherencia IA
              </span>
            </div>
            <p className="text-sm text-stone-300/90 leading-relaxed whitespace-pre-line">{feedback.text}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-stone-900 cal-loading-dot"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
