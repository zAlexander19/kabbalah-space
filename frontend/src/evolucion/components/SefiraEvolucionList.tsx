import type { SefiraEvolucion, Metrics } from '../types';
import SefiraEvolucionRow from './SefiraEvolucionRow';

type Props = {
  data: SefiraEvolucion[];
  selectedId: string | null;
  metrics: Metrics;
  onSelect: (id: string) => void;
  /** When set, each row shows that month's values instead of the latest. */
  pinnedMonth?: string;
};

export default function SefiraEvolucionList({ data, selectedId, metrics, onSelect, pinnedMonth }: Props) {
  if (data.length === 0) {
    return <p className="text-xs text-stone-500 italic">Cargando…</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {data.map(s => (
        <SefiraEvolucionRow
          key={s.sefira_id}
          data={s}
          selected={selectedId === s.sefira_id}
          metrics={metrics}
          onSelect={() => onSelect(s.sefira_id)}
          pinnedMonth={pinnedMonth}
        />
      ))}
    </div>
  );
}
