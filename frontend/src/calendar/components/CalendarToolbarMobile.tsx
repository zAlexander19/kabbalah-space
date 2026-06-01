import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { CalendarView } from '../types';

type Props = {
  date: Date;
  view: CalendarView;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (v: CalendarView) => void;
};

const VIEW_OPTIONS: { key: CalendarView; label: string }[] = [
  { key: 'semana', label: 'Semana' },
  { key: 'mes',    label: 'Mes' },
  { key: 'anio',   label: 'Año' },
];

export default function CalendarToolbarMobile({
  date,
  view,
  onPrev,
  onNext,
  onToday,
  onViewChange,
}: Props) {
  // Label dinámico según view
  let label: string;
  if (view === 'semana') {
    label = format(date, "EEEE d 'de' MMM", { locale: es });
  } else if (view === 'mes') {
    label = format(date, "MMMM yyyy", { locale: es });
  } else {
    label = String(date.getFullYear());
  }

  return (
    <div className="w-full bg-[#15181d] border border-stone-700/40 rounded-2xl overflow-hidden">
      {/* Fila 1: prev / label / next */}
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Anterior"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-amber-100/90 text-sm font-medium capitalize">{label}</span>
        <button
          type="button"
          onClick={onNext}
          aria-label="Siguiente"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-800/50 text-stone-300"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Fila 2: Hoy + Segmented control */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-stone-800/60">
        <button
          type="button"
          onClick={onToday}
          className="text-xs text-amber-200/80 hover:text-amber-100 tracking-wide px-2 py-1 rounded"
        >
          Hoy
        </button>
        <div className="flex rounded-full border border-stone-700/60 overflow-hidden">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onViewChange(opt.key)}
              className={`px-3 py-1.5 text-xs transition-colors ${
                view === opt.key
                  ? 'bg-amber-300/20 text-amber-100 border-amber-300/50'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
