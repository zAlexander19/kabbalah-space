import { useMemo, useState } from 'react';
import { startOfMonth } from 'date-fns';
import type { SefiraNode, Activity } from './types';
import { useCalendarRange } from './hooks/useCalendarRange';
import { useActivities } from './hooks/useActivities';
import { apiFetch } from '../auth';
import { useGcalStatus } from '../sync';
import CalendarToolbar from './components/CalendarToolbar';
import WeekView from './views/WeekView';
import MonthView from './views/MonthView';
import YearView from './views/YearView';
import ViewMorph from './views/ViewMorph';
import SefirotTree from './components/SefirotTree';
import SefirotLegend from './components/SefirotLegend';
import ActivityPanel from './components/ActivityPanel';
import RecurrenceScopeDialog from './components/RecurrenceScopeDialog';
import GcalSyncCard from './components/GcalSyncCard';

type Scope = 'one' | 'series';
type ScopePending = { activity: Activity; mode: 'edit' | 'delete' } | null;

type Props = {
  sefirot: SefiraNode[];
  glowText: string;
};

export default function CalendarModule({ sefirot, glowText }: Props) {
  const { anchor, setAnchor, view, setView, range, goPrev, goNext, goToday } = useCalendarRange();
  const { activities, volume, loading, error, reload } = useActivities(range);
  const { status: gcalStatus } = useGcalStatus(true);
  const gcalEnabled = gcalStatus?.enabled === true;

  const [filterId, setFilterId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [pendingSlot, setPendingSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [scope, setScope] = useState<Scope>('one');
  const [scopeDialog, setScopeDialog] = useState<ScopePending>(null);

  const filteredActivities = useMemo(() => {
    if (!filterId) return activities;
    return activities.filter(a => a.sefirot.some(s => s.id === filterId));
  }, [activities, filterId]);

  function openCreate() {
    setEditing(null);
    setPendingSlot(null);
    setScope('one');
    setPanelOpen(true);
  }

  // Two distinct in-panel states. Used to gate which calendar interactions
  // are allowed without losing the user's in-progress work.
  const inCreateMode = panelOpen && editing === null;
  const inEditMode   = panelOpen && editing !== null;

  function openSlot(start: Date, end: Date) {
    // Editing an existing activity: ignore slot clicks — the user must
    // exit edit mode via the form buttons.
    if (inEditMode) return;

    // Creating: just move the ghost (and the form's date/time follows),
    // but KEEP whatever the user already typed in the form. Skip the
    // overlap → openEvent shortcut so a click never turns into "switch
    // to editing" while a create is in flight.
    if (inCreateMode) {
      setPendingSlot({ start, end });
      return;
    }

    // Idle: starting a fresh create. If the click lands on top of an
    // existing event, jump to editing that event instead.
    const overlap = activities.find(a => new Date(a.inicio) < end && new Date(a.fin) > start);
    if (overlap) {
      openEvent(overlap);
      return;
    }
    setEditing(null);
    setPendingSlot({ start, end });
    setScope('one');
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
    // Chip body click: don't switch to editing while a create is in
    // progress — the user must finish or cancel the create first.
    if (inCreateMode) return;
    openEventForce(a);
  }

  function openEventForce(a: Activity) {
    // Kebab "Editar" menu: explicit intent from the user — proceed even
    // if there's a create in progress. The form's draft persistence
    // saves the create's content so re-opening it later restores the
    // typed fields.
    if (a.serie_id) {
      setScopeDialog({ activity: a, mode: 'edit' });
      return;
    }
    setEditing(a);
    setPendingSlot(null);
    setScope('one');
    setPanelOpen(true);
  }

  function handleScopeChosen(chosenScope: Scope) {
    if (!scopeDialog) return;
    const { activity, mode } = scopeDialog;
    setScopeDialog(null);
    if (mode === 'edit') {
      setEditing(activity);
      setPendingSlot(null);
      setScope(chosenScope);
      setPanelOpen(true);
    } else {
      void deleteWithScope(activity.id, chosenScope);
    }
  }

  async function deleteWithScope(id: string, chosenScope: Scope) {
    const res = await apiFetch(`/actividades/${id}?scope=${chosenScope}`, { method: 'DELETE' });
    if (res.ok) {
      setPanelOpen(false);
      reload();
    }
  }

  // Triggered from the kebab menu on an activity chip. For series, defer
  // to the scope dialog (delete one vs. delete entire series). For
  // singles, the chip itself already required a confirm-click, so we
  // delete directly here. Note: no guard against inCreateMode/inEditMode
  // — the calendar grid lifts to z-60 while the panel is open, so chips
  // remain clickable; users legitimately delete via the kebab while a
  // panel is on screen, and deleteWithScope already closes it on success.
  function deleteFromMenu(a: Activity) {
    if (a.serie_id) {
      setScopeDialog({ activity: a, mode: 'delete' });
      return;
    }
    void deleteWithScope(a.id, 'one');
  }

  function requestDeleteScopeFromForm() {
    if (!editing) return;
    setPanelOpen(false);
    setScopeDialog({ activity: editing, mode: 'delete' });
  }

  function toggleFilter(id: string) {
    setFilterId(prev => prev === id ? null : id);
  }

  function closePanel() {
    setPanelOpen(false);
    setPendingSlot(null);
  }

  function handleSaved() {
    closePanel();
    reload();
  }

  function handleDeleted() {
    closePanel();
    reload();
  }

  return (
    <div className="w-full flex flex-col gap-6 md:gap-8">
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
                onEventEdit={openEventForce}
                onEventDelete={deleteFromMenu}
                gcalEnabled={gcalEnabled}
                pendingSlot={editing === null ? pendingSlot : null}
              />
            )}
            {view === 'mes' && (
              <MonthView
                date={anchor}
                activities={filteredActivities}
                onDayClick={openDay}
                onEventClick={openEvent}
                onEventEdit={openEventForce}
                onEventDelete={deleteFromMenu}
                gcalEnabled={gcalEnabled}
              />
            )}
            {view === 'anio' && (
              <YearView date={anchor} activities={activities} onMonthClick={openMonth} />
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

        <SefirotTree sefirot={sefirot} volume={volume} filterId={filterId} onFilterToggle={toggleFilter} />
        <SefirotLegend volume={volume} filterId={filterId} onFilterToggle={toggleFilter} />
      </div>

      <ActivityPanel
        open={panelOpen}
        sefirot={sefirot}
        editing={editing}
        initialSlot={pendingSlot}
        scope={scope}
        onClose={closePanel}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        onRequestDeleteScope={requestDeleteScopeFromForm}
      />

      <RecurrenceScopeDialog
        open={scopeDialog !== null}
        mode={scopeDialog?.mode ?? 'edit'}
        onChoose={handleScopeChosen}
        onCancel={() => setScopeDialog(null)}
      />
    </div>

      <GcalSyncCard />
    </div>
  );
}
