// frontend/src/calendar/views/YearViewMobile.tsx
import { useMemo } from 'react';
import { addMonths, startOfMonth, endOfMonth, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Activity, SefiraNode } from '../types';
import { SEFIRA_COLORS } from '../../shared/tokens';

type Props = {
  date: Date;
  activities: Activity[];
  sefirot: SefiraNode[];
  onPrevYear: () => void;
  onNextYear: () => void;
  onSelectMonth: (monthDate: Date) => void;
};

export default function YearViewMobile({
  date,
  activities,
  sefirot,
  onPrevYear,
  onNextYear,
  onSelectMonth,
}: Props) {
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => startOfMonth(addMonths(yearStart, i)));
  }, [yearStart]);

  // Counts per (month index, sefira id).
  const heatmap = useMemo(() => {
    const m: Record<number, Record<string, number>> = {};
    for (let i = 0; i < 12; i++) m[i] = {};
    for (const act of activities) {
      const monthIdx = new Date(act.inicio).getMonth();
      for (const s of act.sefirot) {
        m[monthIdx][s.id] = (m[monthIdx][s.id] ?? 0) + 1;
      }
    }
    return m;
  }, [activities]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800/60">
        <button
          type="button"
          onClick={onPrevYear}
          aria-label="Año anterior"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-base text-amber-100/90 font-medium tabular-nums">
          {date.getFullYear()}
        </h2>
        <button
          type="button"
          onClick={onNextYear}
          aria-label="Año siguiente"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Months list */}
      <div className="px-4 py-3 space-y-2">
        {months.map((monthDate, i) => {
          const monthLabel = format(monthDate, 'MMMM', { locale: es });
          const monthEnd = endOfMonth(monthDate);
          const totalActsThisMonth = activities.filter((a) => {
            const t = new Date(a.inicio).getTime();
            return t >= monthDate.getTime() && t <= monthEnd.getTime();
          }).length;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectMonth(monthDate)}
              className="w-full rounded-xl border border-stone-800/60 bg-stone-900/30 hover:bg-stone-900/60 px-4 py-3 flex flex-col gap-2 text-left transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-stone-100 capitalize text-sm font-medium">{monthLabel}</span>
                <span className="text-[10px] text-stone-500 uppercase tracking-[0.12em]">
                  {totalActsThisMonth} {totalActsThisMonth === 1 ? 'actividad' : 'actividades'}
                </span>
              </div>
              <div className="flex gap-1">
                {sefirot.map((s) => {
                  const count = heatmap[i][s.id] ?? 0;
                  const opacity = count === 0 ? 0.15 : Math.min(1, 0.3 + count / 10);
                  const color = SEFIRA_COLORS[s.id] ?? '#a3a3a3';
                  return (
                    <div
                      key={s.id}
                      className="rounded-sm w-5 h-5"
                      style={{ background: color, opacity }}
                      title={`${s.name}: ${count}`}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
