import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { startOfMonth, startOfWeek, addDays, format, isSameMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Activity } from '../types';
import { ink } from '../../shared/tokens';
import { staggerContainer, fadeUp } from '../motion/transitions';

type Props = {
  date: Date;
  activities: Activity[];
  onMonthClick: (monthDate: Date) => void;
};

type MonthCell = {
  index: number;
  date: Date;
  label: string;
  total: number;
  daysWithActivity: Set<string>;
};

export default function YearView({ date, activities, onMonthClick }: Props) {
  const year = date.getFullYear();
  const today = new Date();

  const months = useMemo<MonthCell[]>(() => {
    const arr: MonthCell[] = [];
    for (let m = 0; m < 12; m++) {
      const monthDate = new Date(year, m, 1);
      const label = format(monthDate, 'MMMM', { locale: es });
      arr.push({ index: m, date: monthDate, label, total: 0, daysWithActivity: new Set() });
    }
    for (const act of activities) {
      const d = new Date(act.inicio);
      if (d.getFullYear() !== year) continue;
      const cell = arr[d.getMonth()];
      if (cell) {
        cell.total += 1;
        cell.daysWithActivity.add(format(d, 'yyyy-MM-dd'));
      }
    }
    return arr;
  }, [activities, year]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="grid grid-cols-2 md:grid-cols-3 gap-3"
    >
      {months.map(cell => (
        <motion.button
          key={cell.index}
          variants={fadeUp}
          whileHover={{ y: -2 }}
          transition={{ duration: 0.25 }}
          type="button"
          onClick={() => onMonthClick(cell.date)}
          className="text-left rounded-2xl border border-stone-700/40 bg-[#15181d] hover:border-amber-300/40 hover:bg-[#1b1f26] p-4 transition-colors"
        >
          <p className="text-stone-200 capitalize text-sm font-serif">{cell.label}</p>
          <MiniMonthGrid date={cell.date} activeDays={cell.daysWithActivity} today={today} />
          <p className="text-[10px] text-stone-400 uppercase tracking-[0.16em] mt-3">{cell.total} actividades</p>
        </motion.button>
      ))}
    </motion.div>
  );
}

function MiniMonthGrid({ date, activeDays, today }: { date: Date; activeDays: Set<string>; today: Date }) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(date);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [date]);

  return (
    <div className="grid grid-cols-7 gap-[2px] mt-3">
      {days.map(d => {
        const inMonth = isSameMonth(d, date);
        const key = format(d, 'yyyy-MM-dd');
        const hasActivity = activeDays.has(key);
        const isToday = isSameDay(d, today);
        return (
          <div
            key={key}
            className="aspect-square rounded-[2px] flex items-center justify-center"
            style={{
              background: hasActivity ? ink.emberSoft : 'rgba(255,255,255,0.02)',
              opacity: inMonth ? 1 : 0.3,
              outline: isToday ? `1px solid ${ink.ember}` : 'none',
            }}
          >
            {hasActivity && <span className="w-1 h-1 rounded-full" style={{ background: ink.ember }} />}
          </div>
        );
      })}
    </div>
  );
}
