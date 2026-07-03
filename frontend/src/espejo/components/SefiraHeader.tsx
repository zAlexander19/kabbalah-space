import type { SefiraResumen, Registro } from '../types';
import { Calendar } from 'lucide-react';

type Props = {
  resumen: SefiraResumen;
  description: string;
  registros: Registro[];
};

export default function SefiraHeader({ resumen, description, registros }: Props) {
  // Último score del usuario (no necesariamente del mismo registro que el de IA,
  // porque una reflexión libre no genera ia y un /ia/respuestas/evaluar no
  // genera user score).
  const latestUserEntry = registros.find(r => r.puntuacion_usuario !== null);
  const latestUserScore = latestUserEntry?.puntuacion_usuario ?? null;

  // Último score de IA (mismo valor que resumen.score_ia_promedio que ahora
  // devuelve el último, no el promedio).
  const latestIaScore = resumen.score_ia_promedio;

  return (
    <div>
      <h3 className="font-serif text-3xl md:text-4xl text-amber-100/95 tracking-tight">{resumen.sefira_nombre}</h3>
      <div className="h-px w-32 bg-gradient-to-r from-amber-300/60 to-transparent my-4" />
      <p className="text-stone-300/90 text-sm leading-relaxed mb-6">{description}</p>

      <div className="grid grid-cols-3 gap-3">
        <ScoreStat label="Usuario" value={latestUserScore} accent="stone" />
        <ScoreStat label="IA" value={latestIaScore} accent="amber" />
        <ActividadesStat count={resumen.actividades_total} />
      </div>
    </div>
  );
}

function ScoreStat({ label, value, accent }: {
  label: string;
  value: number | null;
  accent: 'amber' | 'stone';
}) {
  const borderClass = accent === 'amber' ? 'border-amber-300/30' : 'border-stone-800/50';
  return (
    <div className={`bg-stone-900/40 border ${borderClass} rounded-xl p-3`}>
      <div className="font-serif text-amber-100/90 text-xl">
        {value !== null ? value.toFixed(1) : '—'}
      </div>
      <p className="text-[9px] uppercase tracking-[0.16em] text-stone-500 mt-1">Score {label}</p>
    </div>
  );
}

function ActividadesStat({ count }: { count: number }) {
  function goToCalendar() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('navigate:calendario'));
    }
  }

  if (count === 0) {
    return (
      <button
        type="button"
        onClick={goToCalendar}
        className="bg-stone-900/40 border border-amber-300/30 hover:border-amber-300/60 hover:bg-stone-900/60 rounded-xl p-3 text-left transition-colors cursor-pointer flex flex-col justify-center items-start gap-1"
      >
        <Calendar size={14} className="text-amber-200/80" />
        <p className="text-[10px] uppercase tracking-[0.14em] text-amber-200/90 leading-snug">
          Registrá actividades en tu calendario
        </p>
      </button>
    );
  }

  return (
    <div className="bg-stone-900/40 border border-stone-800/50 rounded-xl p-3">
      <div className="font-serif text-amber-100/90 text-xl tabular-nums">{count}</div>
      <p className="text-[9px] uppercase tracking-[0.16em] text-stone-500 mt-1">
        Actividad{count === 1 ? '' : 'es'}
      </p>
    </div>
  );
}
