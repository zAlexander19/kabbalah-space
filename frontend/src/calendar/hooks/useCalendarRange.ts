import { useMemo, useState, useCallback } from 'react';
import { startOfWeek, endOfWeek, startOfMonth, addDays, addMonths, addYears } from 'date-fns';
import type { CalendarView, DateRange } from '../types';

export function useCalendarRange(initialDate: Date = new Date()) {
  const [anchor, setAnchor] = useState<Date>(initialDate);
  const [view, setView] = useState<CalendarView>('semana');

  const range = useMemo<DateRange>(() => {
    if (view === 'semana') {
      return {
        start: startOfWeek(anchor, { weekStartsOn: 1 }),
        end:   endOfWeek(anchor,   { weekStartsOn: 1 }),
      };
    }
    if (view === 'mes') {
      const monthStart = startOfMonth(anchor);
      return {
        start: startOfWeek(monthStart, { weekStartsOn: 1 }),
        end:   addDays(startOfWeek(monthStart, { weekStartsOn: 1 }), 41),
      };
    }
    return {
      start: new Date(anchor.getFullYear(), 0, 1, 0, 0, 0),
      end:   new Date(anchor.getFullYear(), 11, 31, 23, 59, 59),
    };
  }, [anchor, view]);

  const goPrev = useCallback(() => {
    setAnchor(prev => {
      if (view === 'semana') return addDays(prev, -7);
      if (view === 'mes')    return addMonths(prev, -1);
      return addYears(prev, -1);
    });
  }, [view]);

  const goNext = useCallback(() => {
    setAnchor(prev => {
      if (view === 'semana') return addDays(prev, 7);
      if (view === 'mes')    return addMonths(prev, 1);
      return addYears(prev, 1);
    });
  }, [view]);

  const goToday = useCallback(() => setAnchor(new Date()), []);

  return { anchor, setAnchor, view, setView, range, goPrev, goNext, goToday };
}
