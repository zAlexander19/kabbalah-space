import { useMemo, useState } from 'react';
import { startOfMonth } from 'date-fns';
import type { SefiraNode, Activity } from './types';
import { useCalendarRange } from './hooks/useCalendarRange';
import { useActivities } from './hooks/useActivities';
import CalendarToolbar from './components/CalendarToolbar';
import WeekView from './views/WeekView';
import MonthView from './views/MonthView';
import YearView from './views/YearView';
import ViewMorph from './views/ViewMorph';
import SefirotTree from './components/SefirotTree';
import SefirotLegend from './components/SefirotLegend';
import ActivityPanel from './components/ActivityPanel';

type Props = {
  sefirot: SefiraNode[];
  glowText: string;
};

export default function CalendarModule({ sefirot, glowText }: Props) {
  const { anchor, setAnchor, view, setView, range, goPrev, goNext, goToday } = useCalendarRange();
  const { activities, volume, loading, error, reload } = useActivities(range);

  const [filterId, setFilterId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [pendingSlot, setPendingSlot] = useState<{ start: Date; end: Date } | null>(null);

  const filteredActivities = useMemo(() => {
    if (!filterId) return activities;
    return activities.filter(a => a.sefirot.some(s => s.id === filterId));
  }, [activities, filterId]);

  function openCreate() {
    setEditing(null);
    setPendingSlot(null);
    setPanelOpen(true);
  }

  function openSlot(start: Date, end: Date) {
    const overlap = activities.find(a => new Date(a.inicio) < end && new Date(a.fin) > start);
    if (overlap) {
      setEditing(overlap);
      setPendingSlot(null);
    } else {
      setEditing(null);
      setPendingSlot({ start, end });
    }
    setPanelOpen(true);
  }

  function openDay(day: Date) {
    setAnchor(day);
    setView('semana');
  }

  function openMonth(monthDate: Date) {
    setAnchor(startOfMonth(monthDate));
    setView('mes');
  }

  function openEvent(a: Activity) {
    setEditing(a);
    setPendingSlot(null);
    setPanelOpen(true);
  }

  function toggleFilter(id: string) {
    setFilterId(prev => prev === id ? null : id);
  }

  function handleSaved() {
    setPanelOpen(false);
    reload();
  }

  function handleDeleted() {
    setPanelOpen(false);
    reload();
  }

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
      <div className={`lg:col-span-7 xl:col-span-7 2xl:col-span-8 w-full min-w-0 bg-[#15181d] border border-stone-700/40 rounded-[2rem] p-5 md:p-6 shadow-2xl relative ${panelOpen ? 'z-[60]' : 'z-10'}`}>
        <CalendarToolbar
          date={anchor}
          view={view}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onViewChange={setView}
          onCreate={openCreate}
        />

        {error && <p className="text-red-300 text-sm mb-4">{error}</p>}

        <div className="border border-stone-700/40 rounded-2xl p-4 bg-[#0e1014] relative overflow-hidden">
          {loading && (
            <div
              className="absolute inset-0 pointer-events-none z-30"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(233,195,73,0.08) 50%, transparent 100%)',
                animation: 'shimmer-load 1.5s linear infinite',
              }}
            />
          )}
          <style>{`
            @keyframes shimmer-load {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>

          <ViewMorph view={view}>
            {view === 'semana' && (
              <WeekView
                date={anchor}
                activities={filteredActivities}
                onSlotClick={openSlot}
                onEventClick={openEvent}
              />
            )}
            {view === 'mes' && (
              <MonthView
                date={anchor}
                activities={filteredActivities}
                onDayClick={openDay}
                onEventClick={openEvent}
              />
            )}
            {view === 'anio' && (
              <YearView
                date={anchor}
                activities={activities}
                onMonthClick={openMonth}
              />
            )}
          </ViewMorph>

          {!loading && filteredActivities.length === 0 && view !== 'anio' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-stone-400 text-sm font-serif italic">El templo descansa.</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mt-2">Crea tu primera actividad</p>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-5 xl:col-span-5 2xl:col-span-4 w-full bg-[#15181d] border border-stone-700/40 rounded-[2rem] p-6 shadow-2xl">
        <h3 className={`font-serif text-2xl mb-2 ${glowText}`}>Árbol Energético Semanal</h3>
        <p className="text-stone-400 text-sm mb-6">Cada sefirá crece según las actividades que cargues en esa dimensión.</p>

        <SefirotTree
          sefirot={sefirot}
          volume={volume}
          filterId={filterId}
          onFilterToggle={toggleFilter}
        />

        <SefirotLegend
          volume={volume}
          filterId={filterId}
          onFilterToggle={toggleFilter}
        />
      </div>

      <ActivityPanel
        open={panelOpen}
        sefirot={sefirot}
        editing={editing}
        initialSlot={pendingSlot}
        onClose={() => setPanelOpen(false)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
