import { motion } from 'framer-motion';
import type { Metrics } from '../types';
import { ink } from '../../shared/tokens';

const OPTIONS: { key: 'ambos' | 'usuario' | 'ia'; label: string }[] = [
  { key: 'ambos',   label: 'Ambos' },
  { key: 'usuario', label: 'Usuario' },
  { key: 'ia',      label: 'IA' },
];

function activeMode(m: Metrics): 'ambos' | 'usuario' | 'ia' {
  if (m.usuario && m.ia) return 'ambos';
  if (m.usuario) return 'usuario';
  return 'ia';
}

type Props = {
  value: Metrics;
  onChange: (v: Metrics) => void;
};

export default function MetricToggle({ value, onChange }: Props) {
  const mode = activeMode(value);

  function pick(key: 'ambos' | 'usuario' | 'ia') {
    if (key === 'ambos')   onChange({ usuario: true,  ia: true });
    if (key === 'usuario') onChange({ usuario: true,  ia: false });
    if (key === 'ia')      onChange({ usuario: false, ia: true });
  }

  return (
    <div className="relative inline-flex items-center rounded-xl bg-[#20242b] border border-stone-700/45 p-1">
      {OPTIONS.map(opt => (
        <button
          key={opt.key}
          type="button"
          onClick={() => pick(opt.key)}
          className="relative px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.12em] z-10 transition-colors"
          style={{ color: mode === opt.key ? '#1c1917' : '#d6d3d1' }}
        >
          {mode === opt.key && (
            <motion.span
              layoutId="evolucion-metric-pill"
              className="absolute inset-0 rounded-lg"
              style={{ background: ink.ember }}
              transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            />
          )}
          <span className="relative">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
