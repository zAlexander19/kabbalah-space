import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Lock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { PreguntaConEstado } from '../types';
import { API_BASE } from '../../shared/tokens';

type Props = {
  pregunta: PreguntaConEstado;
  onSaved: () => void;
};

export default function QuestionCard({ pregunta, onSaved }: Props) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  useEffect(() => { setText(''); setError(null); }, [pregunta.pregunta_id]);

  async function handleSave() {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/respuestas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta_id: pregunta.pregunta_id, respuesta_texto: text.trim() }),
      });
      if (res.ok) {
        setText('');
        onSaved();
      } else {
        const data = await res.json().catch(() => ({ detail: 'No se pudo guardar' }));
        setError(data.detail ?? 'No se pudo guardar');
        setShake(s => s + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  const showLast = pregunta.ultima_respuesta !== null;
  const fechaLast = pregunta.fecha_ultima ? format(parseISO(pregunta.fecha_ultima), "d 'de' MMMM", { locale: es }) : '';
  const fechaNext = pregunta.siguiente_disponible ? format(parseISO(pregunta.siguiente_disponible), "d 'de' MMMM", { locale: es }) : '';

  return (
    <motion.div
      key={shake}
      animate={shake ? { x: [-3, 3, -2, 2, 0] } : { x: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-stone-700/40 bg-stone-950/30 p-4 space-y-3"
    >
      <p className="text-sm text-stone-200 leading-relaxed">{pregunta.texto_pregunta}</p>

      {showLast && (
        <details className="text-xs text-stone-400 group">
          <summary className="cursor-pointer hover:text-stone-300 inline-flex items-center gap-1 list-none">
            <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
            Tu última respuesta · {fechaLast}
          </summary>
          <p className="mt-2 italic text-stone-300/80 pl-3 border-l border-stone-700/40">
            {pregunta.ultima_respuesta}
          </p>
        </details>
      )}

      {pregunta.bloqueada ? (
        <div className="rounded-lg bg-stone-950/60 border border-stone-700/30 p-3 flex items-center gap-3">
          <Lock size={14} className="text-amber-300/60 shrink-0" />
          <div className="text-xs text-stone-400">
            Disponible nuevamente el <span className="text-amber-200/80">{fechaNext}</span>
            {pregunta.dias_restantes !== null && (
              <span className="block text-[10px] text-stone-500 mt-0.5">en {pregunta.dias_restantes} días</span>
            )}
          </div>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={handleSave}
          placeholder={showLast ? 'Nueva entrada...' : 'Escribí tu reflexión...'}
          disabled={saving}
          className="w-full min-h-[80px] resize-y bg-[#1b1f25] border border-stone-700/50 focus:border-amber-300/60 focus:outline-none text-sm text-stone-100 rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
        />
      )}

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

      {!pregunta.bloqueada && (
        <p className="text-[10px] text-stone-500">Se guarda al salir del campo</p>
      )}
    </motion.div>
  );
}
