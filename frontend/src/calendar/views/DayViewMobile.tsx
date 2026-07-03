// frontend/src/calendar/views/WeekViewMobile.tsx
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Activity } from '../types';
import { ink } from '../../shared/tokens';
import CalendarEvent from '../components/CalendarEvent';

const HOUR_HEIGHT = 56;
const HOUR_START = 6;
const HOUR_END = 23;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const SWIPE_THRESHOLD = 50;

type Props = {
  date: Date;
  activities: Activity[];
  onPrevDay: () => void;
  onNextDay: () => void;
  onSlotClick?: (start: Date, end: Date) => void;
  onEventClick?: (a: Activity) => void;
  onEventEdit?: (a: Activity) => void;
  onEventDelete?: (a: Activity) => void;
  onEventMove?: (id: string, newStart: Date, newEnd: Date) => void;
  gcalEnabled?: boolean;
};

export default function DayViewMobile({
  date,
  activities,
  onPrevDay,
  onNextDay,
  onSlotClick,
  onEventClick,
  onEventEdit,
  onEventDelete,
  onEventMove,
  gcalEnabled = false,
}: Props) {
  const reduced = useReducedMotion();
  const dayKey = format(date, 'yyyy-MM-dd');

  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const dayEvents = useMemo(() => {
    return activities.filter((act) => format(new Date(act.inicio), 'yyyy-MM-dd') === dayKey);
  }, [activities, dayKey]);

  const isToday = isSameDay(date, now);
  const nowOffsetPx = isToday
    ? (now.getHours() - HOUR_START) * HOUR_HEIGHT + (now.getMinutes() / 60) * HOUR_HEIGHT
    : -1;

  function handleSlotClick(hour: number) {
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1);
    onSlotClick?.(start, end);
  }

  function eventStyle(act: Activity): React.CSSProperties {
    const startD = new Date(act.inicio);
    const endD = new Date(act.fin);
    const top = (startD.getHours() - HOUR_START) * HOUR_HEIGHT + (startD.getMinutes() / 60) * HOUR_HEIGHT;
    const heightHrs = Math.max(0.5, (endD.getTime() - startD.getTime()) / 3600000);
    return { position: 'absolute', top, height: heightHrs * HOUR_HEIGHT - 4, left: 4, right: 4 };
  }

  function handleDragEnd(_: unknown, info: { offset: { x: number } }) {
    if (info.offset.x < -SWIPE_THRESHOLD) onNextDay();
    else if (info.offset.x > SWIPE_THRESHOLD) onPrevDay();
  }

  const dayLabel = format(date, "EEEE d 'de' MMMM yyyy", { locale: es });

  return (
    <div className="w-full" style={{ overscrollBehavior: 'contain' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800/60">
        <button
          type="button"
          onClick={onPrevDay}
          aria-label="Día anterior"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-sm text-amber-100/90 font-medium capitalize">{dayLabel}</h2>
        <button
          type="button"
          onClick={onNextDay}
          aria-label="Día siguiente"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Swipeable day content */}
      <motion.div
        key={dayKey}
        drag={reduced ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.18 }}
        className="touch-pan-y"
      >
        <div className="grid relative" style={{ gridTemplateColumns: '60px 1fr' }}>
          {/* Hour column */}
          <div className="relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="text-[10px] text-stone-500 text-right pr-2"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="relative -top-1.5">{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {/* Day column */}
          <div className="relative border-l border-stone-800/40">
            {HOURS.map((h) => (
              <div
                key={h}
                data-slot={`${dayKey}|${h}`}
                onClick={() => handleSlotClick(h)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSlotClick(h);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Crear actividad a las ${String(h).padStart(2, '0')}:00`}
                className="border-b border-stone-800/30 hover:bg-stone-800/20 transition-colors cursor-pointer"
                style={{ height: HOUR_HEIGHT }}
              />
            ))}
            {/* Now indicator */}
            {nowOffsetPx >= 0 && (
              <div
                className="absolute left-0 right-0 h-px bg-amber-300/80"
                style={{ top: nowOffsetPx }}
              >
                <div
                  className="absolute -left-1 -top-1 w-2 h-2 rounded-full"
                  style={{ background: ink.ember }}
                />
              </div>
            )}
            {/* Events */}
            {dayEvents.map((act) => (
              <CalendarEvent
                key={act.id}
                activity={act}
                variant="week"
                style={eventStyle(act)}
                onClick={onEventClick}
                onEdit={onEventEdit ?? onEventClick}
                onDelete={onEventDelete}
                gcalEnabled={gcalEnabled}
                enableLongPressDrag={true}
                onMove={onEventMove}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
