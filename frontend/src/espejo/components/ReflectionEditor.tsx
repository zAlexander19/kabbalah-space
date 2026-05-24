import { useState } from 'react';
import { apiFetch } from '../../auth';

type Props = {
  sefiraId: string;
  sefiraName: string;
  onSaved: () => void;
};

export default function ReflectionEditor({ sefiraId, sefiraName, onSaved }: Props) {
  const [score, setScore] = useState(5);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scoreTouched, setScoreTouched] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !scoreTouched || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sefira: sefiraName, sefira_id: sefiraId, text, score }),
      });
      if (res.ok) {
        setText('');
        setScore(5);
        setScoreTouched(false);
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
            onChange={e => {
              setScore(parseFloat(e.target.value));
              setScoreTouched(true);
            }}
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
        <p className="text-[10px] text-stone-500 mt-1 italic">
          {!scoreTouched
            ? 'Ajustá la nivelación de energía antes de guardar.'
            : 'Esta reflexión queda como nota personal. La IA evalúa tus respuestas a las preguntas guía.'}
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting || !text.trim() || !scoreTouched}
        className="w-full rounded-xl bg-gradient-to-r from-amber-200/95 to-amber-100 text-stone-900 font-semibold text-xs uppercase tracking-[0.18em] py-3 hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {submitting ? <LoadingDots /> : 'Guardar reflexión'}
      </button>
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
