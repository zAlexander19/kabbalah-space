import { motion } from 'framer-motion';
import type { SefiraEvolucion, Metrics } from '../types';
import { SEFIRA_COLORS, ink } from '../../shared/tokens';

const SPARK_W = 64;
const SPARK_H = 14;

type Props = {
  data: SefiraEvolucion;
  selected: boolean;
  metrics: Metrics;
  onSelect: () => void;
};

function buildSparklinePath(values: (number | null)[], width: number, height: number): string {
  const points = values.map((v, i) => {
    const x = values.length === 1 ? 0 : (i / (values.length - 1)) * width;
    const y = v === null ? null : height - ((v - 1) / 9) * height;
    return { x, y };
  });
  let path = '';
  let pen: 'up' | 'down' = 'up';
  for (const p of points) {
    if (p.y === null) { pen = 'up'; continue; }
    path += pen === 'up' ? `M${p.x.toFixed(1)},${p.y.toFixed(1)} ` : `L${p.x.toFixed(1)},${p.y.toFixed(1)} `;
    pen = 'down';
  }
  return path.trim();
}

export default function SefiraEvolucionRow({ data, selected, metrics, onSelect }: Props) {
  const color = SEFIRA_COLORS[data.sefira_id] ?? '#a3a3a3';
  const lastBucket = [...data.meses].reverse().find(m => m.score_usuario !== null || m.score_ia !== null);
  const lastUsuario = lastBucket?.score_usuario ?? null;
  const lastIa = lastBucket?.score_ia ?? null;

  const usuarioVals = data.meses.map(m => m.score_usuario);
  const iaVals = data.meses.map(m => m.score_ia);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
        selected
          ? 'border-amber-300/40 bg-stone-800/40'
          : 'border-stone-800/50 bg-stone-950/30 hover:bg-stone-900/40'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-xs uppercase tracking-[0.12em] text-stone-200">{data.sefira_nombre}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] tabular-nums">
          {metrics.usuario && (
            <span className="text-stone-200">{lastUsuario !== null ? lastUsuario.toFixed(1) : '—'}</span>
          )}
          {metrics.ia && (
            <span className="text-amber-200/90">{lastIa !== null ? lastIa.toFixed(1) : '—'}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {metrics.usuario && (
          <svg width={SPARK_W} height={SPARK_H} className="block">
            <path d={buildSparklinePath(usuarioVals, SPARK_W, SPARK_H)} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
          </svg>
        )}
        {metrics.ia && (
          <svg width={SPARK_W} height={SPARK_H} className="block">
            <path d={buildSparklinePath(iaVals, SPARK_W, SPARK_H)} fill="none" stroke={ink.ember} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
          </svg>
        )}
        {!metrics.usuario && !metrics.ia && (
          <span className="text-[10px] text-stone-500">Sin métricas activas</span>
        )}
      </div>

      {selected && (
        <motion.div
          layoutId="evolucion-row-marker"
          className="mt-2 h-px w-full"
          style={{ background: `linear-gradient(90deg, ${color}88, transparent)` }}
        />
      )}
    </button>
  );
}
