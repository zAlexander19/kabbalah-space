import { motion } from 'framer-motion';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import type { MesBucket } from '../types';

type Props = {
  bucket: MesBucket;
  x: number;
  color: string;
};

function monthLabel(mesKey: string): string {
  const d = parse(`${mesKey}-01`, 'yyyy-MM-dd', new Date());
  const txt = format(d, "MMMM yyyy", { locale: es });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export default function EvolucionTooltip({ bucket, x, color }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="absolute pointer-events-none z-20 bg-[#0e1014]/95 backdrop-blur-md border border-stone-700/50 rounded-lg px-3 py-2 shadow-xl"
      style={{ left: x, top: 8, transform: 'translateX(-50%)', minWidth: 160 }}
    >
      <p className="text-[10px] uppercase tracking-[0.14em] text-stone-300 mb-1.5">{monthLabel(bucket.mes)}</p>
      <div className="flex items-center justify-between gap-3 text-[11px] mb-1">
        <span className="flex items-center gap-1.5 text-stone-300">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /> Usuario
        </span>
        <span className="tabular-nums" style={{ color }}>
          {bucket.score_usuario !== null ? bucket.score_usuario.toFixed(1) : '—'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] mb-2">
        <span className="flex items-center gap-1.5 text-stone-300">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-300" /> IA
        </span>
        <span className="tabular-nums text-amber-200/90">
          {bucket.score_ia !== null ? bucket.score_ia.toFixed(1) : '—'}
        </span>
      </div>
      <div className="text-[9px] text-stone-500 uppercase tracking-wider border-t border-stone-800/70 pt-1.5">
        {bucket.reflexiones} reflexión{bucket.reflexiones === 1 ? '' : 'es'} · {bucket.respuestas} respuesta{bucket.respuestas === 1 ? '' : 's'}
      </div>
    </motion.div>
  );
}
