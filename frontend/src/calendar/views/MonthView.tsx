import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { startOfMonth, startOfWeek, addDays, format, isSameMonth, isSameDay } from 'date-fns';
import type { Activity } from '../types';
import { ink } from '../tokens';
import { breathRing } from '../motion/breath';
import { staggerContainer } from '../motion/transitions';
import CalendarEvent from '../components/CalendarEvent';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

type Props = {
  date: Date;
  activities: Activity[];
  onDayClick?: (day: Date) => void;
  onEventClick?: (a: Activity) => void;
};

export default function MonthView({ date, activities, onDayClick, onEventClick }: Props) {
  const today = new Date();
  const days = useMemo(() => {
    const monthStart = startOfMonth(date);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [date]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    for (const act of activities) {
      const key = format(new Date(act.inicio), 'yyyy-MM-dd');
      if (!map[key]) map[key] = [];
      map[key].push(act);
    }
    return map;
  }, [activities]);

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-7 mb-2">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-[10px] uppercase tracking-[0.12em] text-stone-400 text-center py-2">{w}</div>
        ))}
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-7 grid-rows-6 gap-px bg-stone-800/30 rounded-xl overflow-hidden"
        style={{ minHeight: 540 }}
      >
        {days.map(day => {
          const inMonth = isSameMonth(day, date);
          const isToday = isSameDay(day, today);
          const dayKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay[dayKey] ?? [];
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visible.length;

          return (
            <div
              key={dayKey}
              onClick={() => onDayClick?.(day)}
              className={`bg-[#15181d] hover:bg-[#1b1f25] cursor-pointer p-1.5 flex flex-col gap-0.5 transition-colors ${inMonth ? '' : 'opacity-40'}`}
            >
              <div className="flex items-center justify-end relative">
                {isToday && (
                  <motion.span
                    variants={breathRing}
                    animate="animate"
                    className="absolute right-0 w-7 h-7 rounded-full"
                    style={{ border: `1px solid ${ink.ember}` }}
                  />
                )}
                <span className={`relative text-[11px] ${isToday ? 'text-amber-300 font-semibold' : 'text-stone-300'} px-1.5`}>
                  {format(day, 'd')}
                </span>
              </div>
              <AnimatePresence mode="popLayout">
                {visible.map(act => (
                  <CalendarEvent key={act.id} activity={act} variant="month" onClick={onEventClick} />
                ))}
              </AnimatePresence>
              {overflow > 0 && (
                <div className="text-[9px] text-stone-400 px-1">+{overflow} más</div>
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
