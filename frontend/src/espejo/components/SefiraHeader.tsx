import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SefiraResumen } from '../types';
import Sparkline from './Sparkline';

type Props = {
  resumen: SefiraResumen;
  description: string;
};

export default function SefiraHeader({ resumen, description }: Props) {
  const ultimaTexto = resumen.ultima_actividad
    ? `hace ${formatDistanceToNow(new Date(resumen.ultima_actividad), { locale: es })}`
    : 'Sin reflexiones aún';

  return (
    <div>
      <h3 className="font-serif text-4xl text-amber-100/95 tracking-tight">{resumen.sefira_nombre}</h3>
      <div className="h-px w-32 bg-gradient-to-r from-amber-300/60 to-transparent my-4" />
      <p className="text-stone-300/90 text-sm leading-relaxed mb-6">{description}</p>

      <div className="grid grid-cols-3 gap-3">
        <Stat
          big={`${resumen.preguntas_disponibles}/${resumen.preguntas_total}`}
          label="Reflexiones disponibles"
        />
        <Stat
          big={resumen.score_ia_promedio !== null ? `IA ${resumen.score_ia_promedio}` : '—'}
          label="Score promedio"
          extra={resumen.score_ia_ultimos.length >= 2 ? <Sparkline values={resumen.score_ia_ultimos} /> : null}
        />
        <Stat
          big={ultimaTexto}
          label="Última actividad"
        />
      </div>
    </div>
  );
}

function Stat({ big, label, extra }: { big: string; label: string; extra?: React.ReactNode }) {
  return (
    <div className="bg-stone-900/40 border border-stone-800/50 rounded-xl p-3">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-amber-100/90 text-xl">{big}</span>
        {extra}
      </div>
      <p className="text-[9px] uppercase tracking-[0.16em] text-stone-500 mt-1">{label}</p>
    </div>
  );
}
