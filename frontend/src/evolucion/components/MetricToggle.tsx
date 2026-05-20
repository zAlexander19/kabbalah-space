import type { Metrics } from '../types';
import { ink } from '../../shared/tokens';

type Key = keyof Metrics;

const OPTIONS: { key: Key; label: string; color: string; dashed?: boolean }[] = [
  { key: 'usuario',     label: 'Usuario',     color: '#94a3b8' },
  { key: 'ia',          label: 'IA',          color: ink.ember },
  { key: 'actividades', label: 'Actividades', color: '#86efac', dashed: true },
];

type Props = {
  value: Metrics;
  onChange: (v: Metrics) => void;
};

export default function MetricToggle({ value, onChange }: Props) {
  function toggle(key: Key) {
    onChange({ ...value, [key]: !value[key] });
  }

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {OPTIONS.map(opt => {
        const active = value[opt.key];
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => toggle(opt.key)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.12em] border transition-colors"
            style={{
              borderColor: active ? opt.color : 'rgba(120,120,120,0.4)',
              background: active ? `${opt.color}22` : 'transparent',
              color: active ? '#f5f5f5' : '#a8a29e',
            }}
            aria-pressed={active}
          >
            <span
              className="block w-3 h-0.5"
              style={{
                background: active ? opt.color : 'rgba(120,120,120,0.6)',
                borderTop: opt.dashed ? `1.5px ${active ? 'dashed' : 'dashed'} ${active ? opt.color : 'rgba(120,120,120,0.6)'}` : undefined,
                height: opt.dashed ? 0 : undefined,
              }}
            />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
