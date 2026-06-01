// frontend/src/calendar/views/MonthViewMobile.tsx
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameDay,
  isSameMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Activity } from '../types';

type Props = {
  date: Date;
  activities: Activity[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onEventClick?: (a: Activity) => void;
  onEventMove?: (id: string, newStart: Date, newEnd: Date) => void;
};

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function MonthViewMobile({
  date,
  activities,
  onPrevMonth,
  onNextMonth,
  onEventClick,
  onEventMove,
}: Props) {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState<Date>(date);

  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = useMemo(() => {
    const out: Date[] = [];
    let cur = gridStart;
    while (cur <= gridEnd) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }, [gridStart, gridEnd]);

  // Group activities by day for fast count.
  const countsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const act of activities) {
      const key = format(new Date(act.inicio), 'yyyy-MM-dd');
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [activities]);

  const selectedKey = format(selectedDay, 'yyyy-MM-dd');
  const selectedEvents = useMemo(
    () => activities.filter((a) => format(new Date(a.inicio), 'yyyy-MM-dd') === selectedKey),
    [activities, selectedKey],
  );

  const monthLabel = format(date, "MMMM yyyy", { locale: es });

  function handleDragEnd(act: Activity, _e: unknown, info: { offset: { x: number; y: number } }, sourceEl: HTMLElement) {
    // Compute drop element from sourceEl bounding rect + offset
    const rect = sourceEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 + info.offset.x;
    const cy = rect.top + rect.height / 2 + info.offset.y;
    const els = document.elementsFromPoint(cx, cy);
    const dayEl = els.find((el) => el instanceof HTMLElement && el.dataset.day);
    if (!(dayEl instanceof HTMLElement) || !dayEl.dataset.day || !onEventMove) return;
    const [y, m, d] = dayEl.dataset.day.split('-').map(Number);
    const startD = new Date(act.inicio);
    const endD = new Date(act.fin);
    const newStart = new Date(y, m - 1, d, startD.getHours(), startD.getMinutes(), 0, 0);
    const durationMs = endD.getTime() - startD.getTime();
    const newEnd = new Date(newStart.getTime() + durationMs);
    onEventMove(act.id, newStart, newEnd);
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800/60">
        <button
          type="button"
          onClick={onPrevMonth}
          aria-label="Mes anterior"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-sm text-amber-100/90 font-medium capitalize">{monthLabel}</h2>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="Mes siguiente"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 px-2 py-2">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] text-stone-500 uppercase tracking-[0.12em]">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1 px-2 pb-3">
        {days.map((day) => {
          const dayKey = format(day, 'yyyy-MM-dd');
          const count = countsByDay[dayKey] ?? 0;
          const inMonth = isSameMonth(day, date);
          const isSelected = isSameDay(day, selectedDay);
          const isCurrent = isSameDay(day, today);
          return (
            <button
              key={dayKey}
              type="button"
              data-day={dayKey}
              onClick={() => setSelectedDay(day)}
              className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                isSelected ? 'ring-2 ring-amber-300/70' : ''
              } ${inMonth ? 'text-stone-100' : 'text-stone-600'} ${
                isCurrent ? 'font-bold text-amber-300' : ''
              } hover:bg-stone-800/40`}
            >
              <span>{format(day, 'd')}</span>
              {count > 0 && count <= 3 && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-amber-300" />
              )}
              {count > 3 && (
                <span className="absolute bottom-0.5 text-[9px] text-amber-300/80">+{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day events */}
      <div className="px-4 py-3 border-t border-stone-800/60">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400 mb-3">
          Eventos del {format(selectedDay, "d 'de' MMMM", { locale: es })}
        </p>
        {selectedEvents.length === 0 ? (
          <p className="text-stone-500 italic text-sm">Nada agendado para este día.</p>
        ) : (
          <ul className="space-y-2">
            {selectedEvents.map((act) => {
              const hora = format(new Date(act.inicio), 'HH:mm');
              const sefiraNames = act.sefirot.map((s) => s.nombre).join(', ');
              const ChipMotion = motion.button;
              return (
                <ChipMotion
                  key={act.id}
                  type="button"
                  onClick={() => onEventClick?.(act)}
                  drag={!!onEventMove}
                  dragMomentum={false}
                  onDragEnd={(e, info) => {
                    const el = (e.target as HTMLElement) ?? null;
                    if (el) handleDragEnd(act, e, info, el);
                  }}
                  whileDrag={{ scale: 1.05, zIndex: 50 }}
                  className="w-full text-left rounded-lg border border-stone-800/60 bg-stone-900/40 hover:bg-stone-900/60 px-3 py-2 flex flex-col"
                >
                  <span className="text-stone-100 text-sm">
                    <span className="text-amber-200/80 tabular-nums">{hora}</span> · {act.titulo}
                  </span>
                  {sefiraNames && (
                    <span className="text-[11px] text-stone-400">{sefiraNames}</span>
                  )}
                </ChipMotion>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
