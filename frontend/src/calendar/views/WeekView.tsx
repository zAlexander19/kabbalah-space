import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { startOfWeek, addDays, format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Activity } from '../types';
import { ink } from '../tokens';
import { breathRing } from '../motion/breath';
import { staggerContainer } from '../motion/transitions';
import CalendarEvent from '../components/CalendarEvent';

const HOUR_HEIGHT = 56;
const HOUR_START = 6;
const HOUR_END = 23;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

type Props = {
  date: Date;
  activities: Activity[];
  onSlotClick?: (start: Date, end: Date) => void;
  onEventClick?: (a: Activity) => void;
};

export default function WeekView({ date, activities, onSlotClick, onEventClick }: Props) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const eventsByDay = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    for (const day of days) map[format(day, 'yyyy-MM-dd')] = [];
    for (const act of activities) {
      const key = format(new Date(act.inicio), 'yyyy-MM-dd');
      if (map[key]) map[key].push(act);
    }
    return map;
  }, [activities, days]);

  const todayIdx = days.findIndex(d => isSameDay(d, now));
  const nowOffsetPx =
    todayIdx >= 0
      ? (now.getHours() - HOUR_START) * HOUR_HEIGHT + (now.getMinutes() / 60) * HOUR_HEIGHT
      : -1;

  function handleSlotClick(day: Date, hour: number) {
    const start = new Date(day);
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
    const height = heightHrs * HOUR_HEIGHT - 4;
    return { top, height, left: 4, right: 4 };
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}>
      <div />
      {days.map(day => {
        const isToday = isSameDay(day, now);
        const dayShort = format(day, 'EEE', { locale: es }).slice(0, 3).toUpperCase();
        return (
          <div key={day.toISOString()} className="flex flex-col items-center justify-center py-2 border-b border-stone-800/40">
            <span className={`text-[10px] uppercase tracking-[0.12em] ${isToday ? 'text-amber-300 font-bold' : 'text-stone-400'}`}>{dayShort}</span>
            <div className="relative mt-1 flex items-center justify-center">
              {isToday && (
                <motion.span
                  variants={breathRing}
                  animate="animate"
                  className="absolute inset-0 rounded-full"
                  style={{ border: `1px solid ${ink.ember}` }}
                />
              )}
              <span className={`flex items-center justify-center text-[20px] h-9 w-9 rounded-full ${isToday ? 'text-amber-300 font-medium' : 'text-stone-100 font-light'}`}>
                {format(day, 'd')}
              </span>
            </div>
          </div>
        );
      })}

      <div className="relative">
        {HOURS.map(h => (
          <div key={h} className="text-[10px] text-stone-500 text-right pr-2" style={{ height: HOUR_HEIGHT }}>
            <span className="relative -top-1.5">{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="col-span-7 grid relative"
        style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}
      >
        {days.map((day, dayIdx) => {
          const isToday = isSameDay(day, now);
          const dayKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay[dayKey] ?? [];
          return (
            <div key={dayKey} className="relative border-l border-stone-800/40">
              {HOURS.map(h => (
                <div
                  key={h}
                  onClick={() => handleSlotClick(day, h)}
                  className="border-b border-stone-800/30 hover:bg-stone-800/20 transition-colors cursor-pointer"
                  style={{ height: HOUR_HEIGHT }}
                />
              ))}
              <AnimatePresence mode="popLayout">
                {dayEvents.map(act => (
                  <CalendarEvent
                    key={act.id}
                    activity={act}
                    variant="week"
                    style={eventStyle(act)}
                    onClick={onEventClick}
                  />
                ))}
              </AnimatePresence>
              {isToday && nowOffsetPx >= 0 && dayIdx === todayIdx && (
                <motion.div
                  layout
                  className="absolute left-0 right-0 pointer-events-none z-20"
                  style={{ top: nowOffsetPx, height: 1, background: ink.ember, opacity: 0.6 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full" style={{ background: ink.ember }} />
                </motion.div>
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
