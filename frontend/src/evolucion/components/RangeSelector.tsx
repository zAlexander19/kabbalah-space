import { motion } from 'framer-motion';
import type { RangeOption } from '../types';
import { ink } from '../../shared/tokens';

const OPTIONS: { key: RangeOption; label: string }[] = [
  { key: 3,      label: '3M' },
  { key: 6,      label: '6M' },
  { key: 12,     label: '12M' },
  { key: 'todo', label: 'Todo' },
];

type Props = {
  value: RangeOption;
  onChange: (v: RangeOption) => void;
};

export default function RangeSelector({ value, onChange }: Props) {
  return (
    <div className="relative inline-flex items-center rounded-xl bg-[#20242b] border border-stone-700/45 p-1">
      {OPTIONS.map(opt => (
        <button
          key={String(opt.key)}
          type="button"
          onClick={() => onChange(opt.key)}
          className="relative px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.12em] z-10 transition-colors"
          style={{ color: value === opt.key ? '#1c1917' : '#d6d3d1' }}
        >
          {value === opt.key && (
            <motion.span
              layoutId="evolucion-range-pill"
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
