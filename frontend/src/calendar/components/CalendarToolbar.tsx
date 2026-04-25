import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { CalendarView } from '../types';
import { ink } from '../tokens';

const VIEW_OPTIONS: { key: CalendarView; label: string }[] = [
  { key: 'semana', label: 'Semana' },
  { key: 'mes',    label: 'Mes' },
  { key: 'anio',   label: 'Año' },
];

type Props = {
  date: Date;
  view: CalendarView;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  onCreate: () => void;
};

export default function CalendarToolbar({ date, view, onPrev, onNext, onToday, onViewChange, onCreate }: Props) {
  let title = '';
  let subtitle = '';

  if (view === 'semana') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    title = format(date, 'MMMM', { locale: es });
    subtitle = `Semana del ${format(start, 'd', { locale: es })} al ${format(end, "d 'de' MMMM", { locale: es })}`;
  } else if (view === 'mes') {
    title = format(date, 'MMMM', { locale: es });
    subtitle = format(date, 'yyyy');
  } else {
    title = format(date, 'yyyy');
    subtitle = 'Vista anual';
  }

  const titleCapitalized = title.charAt(0).toUpperCase() + title.slice(1);

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
      <div className="flex items-end gap-5">
        <div>
          <h2 className="text-3xl md:text-4xl font-serif tracking-tight text-amber-100/90">{titleCapitalized}</h2>
          <p className="text-[10px] text-stone-400 uppercase tracking-[0.16em] mt-1">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onToday}
          className="text-[10px] uppercase tracking-[0.18em] text-stone-400 hover:text-amber-200 transition-colors pb-2"
        >
          Hoy
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap justify-end">
        <div className="relative flex items-center rounded-xl bg-[#20242b] border border-stone-700/45 p-1">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onViewChange(opt.key)}
              className="relative px-4 py-1.5 rounded-lg text-[11px] uppercase tracking-[0.12em] z-10 transition-colors"
              style={{ color: view === opt.key ? '#1c1917' : '#d6d3d1' }}
            >
              {view === opt.key && (
                <motion.span
                  layoutId="view-pill"
                  className="absolute inset-0 rounded-lg"
                  style={{ background: ink.ember }}
                  transition={{ type: 'spring', damping: 24, stiffness: 280 }}
                />
              )}
              <span className="relative">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ x: -2 }}
            transition={{ duration: 0.2 }}
            onClick={onPrev}
            className="w-10 h-10 rounded-full bg-[#1b1f26] hover:bg-[#252830] border border-stone-700/50 text-stone-300 flex items-center justify-center"
            aria-label="Anterior"
          >
            <ChevronLeft size={18} />
          </motion.button>
          <motion.button
            whileHover={{ x: 2 }}
            transition={{ duration: 0.2 }}
            onClick={onNext}
            className="w-10 h-10 rounded-full bg-[#1b1f26] hover:bg-[#252830] border border-stone-700/50 text-stone-300 flex items-center justify-center"
            aria-label="Siguiente"
          >
            <ChevronRight size={18} />
          </motion.button>
        </div>

        <button
          type="button"
          onClick={onCreate}
          className="px-4 py-2.5 rounded-xl bg-amber-300 text-stone-900 text-xs font-semibold tracking-[0.18em] uppercase hover:bg-amber-200 transition-colors"
        >
          Crear actividad
        </button>
      </div>
    </div>
  );
}
