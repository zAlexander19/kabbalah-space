import React, { useEffect, useMemo, useState } from "react";
import { Calendar, Views, dateFnsLocalizer, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { es } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";

type SefiraNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  colorClass: string;
  textClass: string;
};

type ActivitySefira = {
  id: string;
  nombre: string;
};

type Activity = {
  id: string;
  titulo: string;
  descripcion: string | null;
  inicio: string;
  fin: string;
  estado: string;
  sefirot: ActivitySefira[];
};

type VolumeItem = {
  sefira_id: string;
  sefira_nombre: string;
  horas_total: number;
  actividades_total: number;
};

type CalendarModuleProps = {
  sefirot: SefiraNode[];
  glowText: string;
};

type CalendarEvent = {
  title: string;
  start: Date;
  end: Date;
  resource: {
    kind: "activity" | "sample";
    activity?: Activity;
    color: string;
    tagIds: string[];
  };
};

const API_BASE = "http://127.0.0.1:8000";

const locales = {
  es,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const calendarMessages = {
  allDay: "Todo el día",
  previous: "Anterior",
  next: "Siguiente",
  today: "Hoy",
  month: "Mes",
  week: "Semana",
  day: "Día",
  agenda: "Agenda",
  date: "Fecha",
  time: "Hora",
  event: "Evento",
  noEventsInRange: "No hay actividades en este rango.",
  showMore: (total: number) => `+${total} más`,
};

const SEFIRA_COLORS: Record<string, string> = {
  keter: "#d1d5db",
  jojma: "#9ca3af",
  bina: "#71717a",
  jesed: "#3b82f6",
  gevura: "#ef4444",
  tiferet: "#f59e0b",
  netzaj: "#10b981",
  hod: "#f97316",
  yesod: "#8b5cf6",
  maljut: "#a16207",
};

const CONNECTIONS = [
  { n1: "keter", n2: "jojma" },
  { n1: "keter", n2: "bina" },
  { n1: "keter", n2: "tiferet" },
  { n1: "jojma", n2: "bina" },
  { n1: "jojma", n2: "tiferet" },
  { n1: "bina", n2: "tiferet" },
  { n1: "jojma", n2: "jesed" },
  { n1: "bina", n2: "gevura" },
  { n1: "jesed", n2: "netzaj" },
  { n1: "gevura", n2: "hod" },
  { n1: "jesed", n2: "gevura" },
  { n1: "netzaj", n2: "hod" },
  { n1: "jesed", n2: "tiferet" },
  { n1: "gevura", n2: "tiferet" },
  { n1: "netzaj", n2: "tiferet" },
  { n1: "hod", n2: "tiferet" },
  { n1: "yesod", n2: "tiferet" },
  { n1: "netzaj", n2: "yesod" },
  { n1: "hod", n2: "yesod" },
  { n1: "netzaj", n2: "maljut" },
  { n1: "hod", n2: "maljut" },
  { n1: "yesod", n2: "maljut" },
];

function formatLocalDateTimeParts(dateIso: string) {
  const date = new Date(dateIso);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return {
    date: `${yy}-${mm}-${dd}`,
    time: `${hh}:${min}`,
  };
}

const CustomToolbar = (toolbar: any) => {
  const goToBack = () => toolbar.onNavigate("PREV");
  const goToNext = () => toolbar.onNavigate("NEXT");

  const monthName = toolbar.date.toLocaleDateString("es-ES", { month: "long" });
  const monthCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  let subLabel = "";

  if (toolbar.view === "week") {
    const start = startOfWeek(toolbar.date, { weekStartsOn: 1 });
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    subLabel = `Semana del ${start.getDate()} al ${end.getDate()} de ${end.toLocaleDateString("es-ES", { month: "long" })}`;
  } else {
    subLabel = toolbar.date.getFullYear().toString();
  }

  return (
    <div className="flex items-center justify-between px-2 mb-6">
      <div className="flex flex-col">
        <h2 className="text-3xl font-serif text-amber-100/90">{monthCapitalized}</h2>
        <span className="text-[10px] text-stone-400 uppercase tracking-[0.16em] mt-1">{subLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={goToBack}
          className="w-10 h-10 rounded-full bg-[#1b1f26] hover:bg-[#252830] border border-stone-700/50 text-stone-300 transition flex items-center justify-center font-bold"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>
        <button
          onClick={goToNext}
          className="w-10 h-10 rounded-full bg-[#1b1f26] hover:bg-[#252830] border border-stone-700/50 text-stone-300 transition flex items-center justify-center font-bold"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
      </div>
    </div>
  );
};

const CustomDateHeader = ({ date }: { date: Date; label: string }) => {
  const dayName = date.toLocaleDateString("es-ES", { weekday: "short" }).substring(0, 3);
  const dayNum = date.getDate().toString().padStart(2, "0");
  
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  return (
    <div className="flex flex-col items-center justify-center h-full w-full py-1">
      <span className={`text-[10px] font-label font-medium uppercase tracking-[0.1em] ${isToday ? "text-amber-300 font-bold" : "text-stone-400"}`}>
        {dayName}
      </span>
      <span className={`mt-1 flex items-center justify-center text-[22px] font-body h-9 w-9 rounded-full ${isToday ? "bg-[rgba(233,195,73,0.12)] border border-amber-300 text-amber-300 font-medium shadow-[0_0_12px_rgba(233,195,73,0.3)]" : "text-stone-100 font-light"}`}>
        {dayNum}
      </span>
    </div>
  );
};

export default function CalendarModule({ sefirot, glowText }: CalendarModuleProps) {
  type MapFilter = "semana" | "mes" | "anio";

  const [anchorDate, setAnchorDate] = useState(() => new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 10));
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [mapFilter, setMapFilter] = useState<MapFilter>("semana");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [volume, setVolume] = useState<VolumeItem[]>([]);
  const [_, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [selectedSefirot, setSelectedSefirot] = useState<string[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [{ start: visibleStart, end: visibleEnd }, setVisibleRange] = useState(() => {
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  });

  const volumeMap = useMemo(() => {
    const map: Record<string, VolumeItem> = {};
    for (const item of volume) {
      map[item.sefira_id] = item;
    }
    return map;
  }, [volume]);

  const maxActivityCount = useMemo(() => {
    const max = volume.reduce((acc, item) => Math.max(acc, item.actividades_total), 0);
    return Math.max(1, max);
  }, [volume]);

  const calendarView: View = mapFilter === "semana" ? Views.WEEK : Views.MONTH;

  const yearlyBuckets = useMemo(() => {
    const bucket: { month: number; label: string; total: number }[] = [];
    for (let month = 0; month < 12; month++) {
      const label = new Date(calendarDate.getFullYear(), month, 1).toLocaleDateString("es-ES", {
        month: "long",
      });
      bucket.push({ month, label, total: 0 });
    }

    for (const activity of activities) {
      const month = new Date(activity.inicio).getMonth();
      const item = bucket[month];
      if (item) {
        item.total += 1;
      }
    }
    return bucket;
  }, [activities, calendarDate]);

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const realEvents: CalendarEvent[] = activities.map((activity) => ({
      title: `${activity.titulo} · ${activity.sefirot.map((s) => s.nombre).join(", ")}`,
      start: new Date(activity.inicio),
      end: new Date(activity.fin),
      resource: {
        kind: "activity",
        activity,
        color: SEFIRA_COLORS[activity.sefirot[0]?.id] ?? "#eab308",
        tagIds: activity.sefirot.map((tag) => tag.id),
      },
    }));

    if (isPanelOpen && !editingId && date && startTime && endTime) {
      try {
        const startPreview = new Date(`${date}T${startTime}`);
        const endPreview = new Date(`${date}T${endTime}`);
        if (!isNaN(startPreview.getTime()) && !isNaN(endPreview.getTime())) {
          realEvents.push({
            title: title || "Nueva actividad...",
            start: startPreview,
            end: endPreview,
            resource: {
              kind: "sample",
              color: selectedSefirot.length > 0 ? (SEFIRA_COLORS[selectedSefirot[0]] ?? "#4b5563") : "#4b5563",
              tagIds: selectedSefirot,
            }
          });
        }
      } catch (e) {}
    }

    return realEvents;
  }, [activities, calendarDate, isPanelOpen, date, startTime, endTime, title, selectedSefirot]);

  const fetchActivities = async () => {
    const startDate = new Date(visibleStart);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(visibleEnd);
    endDate.setDate(endDate.getDate() + 1);
    endDate.setHours(0, 0, 0, 0);

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    const response = await fetch(`${API_BASE}/actividades?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`);
    if (!response.ok) {
      throw new Error("No se pudieron cargar actividades");
    }
    const data = await response.json();
    setActivities(data);
  };

  const fetchWeeklyVolume = async () => {
    const response = await fetch(`${API_BASE}/energia/volumen-semanal?fecha=${anchorDate}`);
    if (!response.ok) {
      throw new Error("No se pudo cargar el volumen energético");
    }
    const data = await response.json();
    setVolume(data.volumen);
  };

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([fetchActivities(), fetchWeeklyVolume()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [anchorDate, visibleStart, visibleEnd]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setDate(new Date().toISOString().slice(0, 10));
    setStartTime("09:00");
    setEndTime("10:00");
    setSelectedSefirot([]);
  };

  const toggleSefira = (sefiraId: string) => {
    setSelectedSefirot((prev) => {
      if (prev.includes(sefiraId)) {
        return prev.filter((item) => item !== sefiraId);
      }
      return [...prev, sefiraId];
    });
  };

  const submitActivity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedSefirot.length === 0) {
      setError("Debes seleccionar al menos una sefirá para la actividad");
      return;
    }

    const startIso = new Date(`${date}T${startTime}:00`).toISOString();
    const endIso = new Date(`${date}T${endTime}:00`).toISOString();

    const payload = {
      titulo: title,
      descripcion: description,
      inicio: startIso,
      fin: endIso,
      sefirot_ids: selectedSefirot,
    };

    const endpoint = editingId ? `${API_BASE}/actividades/${editingId}` : `${API_BASE}/actividades`;
    const method = editingId ? "PUT" : "POST";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ detail: "No se pudo guardar la actividad" }));
      setError(data.detail ?? "No se pudo guardar la actividad");
      return;
    }

    resetForm();
    setIsPanelOpen(false);
    await loadData();
  };

  const editActivity = (activity: Activity) => {
    const startParts = formatLocalDateTimeParts(activity.inicio);
    const endParts = formatLocalDateTimeParts(activity.fin);

    setEditingId(activity.id);
    setTitle(activity.titulo);
    setDescription(activity.descripcion ?? "");
    setDate(startParts.date);
    setStartTime(startParts.time);
    setEndTime(endParts.time);
    setSelectedSefirot(activity.sefirot.map((item) => item.id));
    setIsPanelOpen(true);
  };

  const deleteActivity = async (activityId: string) => {
    const response = await fetch(`${API_BASE}/actividades/${activityId}`, { method: "DELETE" });
    if (!response.ok) {
      setError("No se pudo eliminar la actividad");
      return;
    }
    await loadData();
    setIsPanelOpen(false);
  };

  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    const overlappingActivity = activities.find(act => {
      const actStart = new Date(act.inicio);
      const actEnd = new Date(act.fin);
      return actStart < end && actEnd > start;
    });

    if (overlappingActivity) {
      editActivity(overlappingActivity);
      return;
    }
    const startParts = formatLocalDateTimeParts(start.toISOString());
    const endParts = formatLocalDateTimeParts(end.toISOString());

    setEditingId(null);
    setTitle("");
    setDescription("");
    setSelectedSefirot([]);
    setDate(startParts.date);
    setStartTime(startParts.time);
    setEndTime(endParts.time);
    setIsPanelOpen(true);
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    if (event.resource.kind === "activity" && event.resource.activity) {
      editActivity(event.resource.activity);
    }
  };

  const handleRangeChange = (range: Date[] | { start: Date; end: Date }) => {
    if (Array.isArray(range)) {
      if (range.length === 0) {
        return;
      }
      const start = range[0];
      const end = range[range.length - 1];
      setVisibleRange({ start, end });
      return;
    }
    setVisibleRange({ start: range.start, end: range.end });
  };

  const handleNavigate = (newDate: Date) => {
    setCalendarDate(newDate);
    const offsetCurrent = new Date(newDate.getTime() - (newDate.getTimezoneOffset() * 60000));
    setAnchorDate(offsetCurrent.toISOString().slice(0, 10));
  };

  useEffect(() => {
    if (mapFilter !== "anio") {
      return;
    }
    const year = calendarDate.getFullYear();
    const start = new Date(year, 0, 1, 0, 0, 0);
    const end = new Date(year, 11, 31, 23, 59, 59);
    setVisibleRange({ start, end });
  }, [mapFilter, calendarDate]);

  const formattedInputDate = useMemo(() => {
    const [yy, mm, dd] = date.split("-");
    if (!yy || !mm || !dd) {
      return "04/12/2026";
    }
    return `${dd}/${mm}/${yy}`;
  }, [date]);

  const timeLabel = useMemo(() => {
    return `${startTime || "00:00"} - ${endTime || "00:00"} hs`;
  }, [startTime, endTime]);

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-[1.5fr_0.5fr] xl:grid-cols-[1.4fr_0.6fr] gap-6 items-start">
      <div className={`bg-[#1b1d21] border border-stone-700/40 rounded-3xl p-5 md:p-6 shadow-2xl transition-all duration-300 relative ${isPanelOpen ? "z-[60]" : "z-10"}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
          <div>
            <h2 className={`font-serif text-3xl tracking-tight ${glowText}`}>Calendario Cabalístico</h2>
            <p className="text-stone-400 text-sm mt-2">La organizacion es parte del camino de rectificacion. organiza tu semana y organiza tus dimensiones</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="flex items-center rounded-xl bg-[#20242b] border border-stone-700/45 p-1">
              {[
                { key: "semana", label: "Semana" },
                { key: "mes", label: "Mes" },
                { key: "anio", label: "Año" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMapFilter(item.key as MapFilter)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-[0.12em] transition ${mapFilter === item.key ? "bg-amber-300 text-stone-900 font-semibold" : "text-stone-300 hover:bg-stone-700/40"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsPanelOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-amber-300 text-stone-900 text-xs font-semibold tracking-[0.18em] uppercase hover:bg-amber-200 transition-colors"
            >
              Crear actividad
            </button>
          </div>
        </div>

        {error && <p className="text-red-300 text-sm mb-4">{error}</p>}

        <div className="border border-stone-700/40 rounded-2xl p-3 bg-[#13161b]">
          <div className="flex items-center justify-between mb-4 gap-4">
            <h3 className="text-sm uppercase tracking-widest font-label text-stone-300">
              Mapa Temporal Espiritual
            </h3>
            <p className="text-xs text-stone-500">Click en evento para editar. Arrastra para crear.</p>
          </div>

          {mapFilter === "anio" ? (
            <div className="h-[640px] overflow-auto pr-1">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {yearlyBuckets.map((month) => (
                  <button
                    key={month.month}
                    type="button"
                    onClick={() => {
                      setCalendarDate(new Date(calendarDate.getFullYear(), month.month, 1));
                      setMapFilter("mes");
                    }}
                    className="text-left rounded-2xl border border-stone-700/40 bg-[#1b1f26] p-4 hover:border-amber-300/40 hover:bg-[#202631] transition"
                  >
                    <p className="text-stone-200 capitalize text-sm font-semibold">{month.label}</p>
                    <p className="text-xs text-stone-400 mt-2">{month.total} actividades</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rbc-theme h-[640px]">
              <Calendar
                localizer={localizer}
                culture="es"
                messages={calendarMessages}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                titleAccessor="title"
                selectable
                popup
                date={calendarDate}
                view={calendarView}
                onNavigate={handleNavigate}
                onRangeChange={handleRangeChange}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectEvent}
                views={mapFilter === "semana" ? [Views.WEEK] : [Views.MONTH]}
                min={new Date(2026, 3, 12, 0, 0, 0)}
                max={new Date(2026, 3, 12, 23, 59, 0)}
                scrollToTime={new Date(2026, 3, 12, 7, 0, 0)}
                step={60}
                timeslots={1}
                components={{
                  toolbar: CustomToolbar,
                  header: CustomDateHeader,
                }}
                formats={{
                  timeGutterFormat: "HH:mm",
                  eventTimeRangeFormat: ({ start, end }, culture, loc) =>
                    `${loc?.format(start, "HH:mm", culture)} - ${loc?.format(end, "HH:mm", culture)}`,
                  dayFormat: "EEE dd/MM",
                  dayHeaderFormat: "EEEE dd/MM",
                }}
                eventPropGetter={(event) => ({
                  className: event.resource.kind === "sample" ? "text-stone-100 border-0 rounded-md ring-2 ring-white/50 opacity-90 animate-pulse" : "text-stone-100 border-0 rounded-md",
                  style: {
                    fontSize: "11px",
                    fontWeight: 600,
                    background: event.resource.color,
                    color: "#f5f5f5",
                    borderRadius: "8px",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
                  },
                })}
              />
            </div>
          )}

      </div>

      <div className="bg-[#1b1d21] border border-stone-700/40 rounded-3xl p-6 shadow-2xl">
        <h3 className={`font-serif text-2xl mb-4 ${glowText}`}>Árbol Energético Semanal</h3>
        <p className="text-stone-400 text-sm mb-6">El tamaño de cada sefirá crece según cuántas actividades están asociadas a esa dimensión.</p>

        <div className="relative w-full h-[560px] max-w-[360px] mx-auto">
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-70" viewBox="0 0 400 800" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            {CONNECTIONS.map((connection) => {
              const n1 = sefirot.find((item) => item.id === connection.n1);
              const n2 = sefirot.find((item) => item.id === connection.n2);
              if (!n1 || !n2) {
                return null;
              }
              return (
                <line
                  key={`${connection.n1}-${connection.n2}`}
                  x1={`${(n1.x / 400) * 100}%`}
                  y1={`${(n1.y / 800) * 100}%`}
                  x2={`${(n2.x / 400) * 100}%`}
                  y2={`${(n2.y / 800) * 100}%`}
                  stroke="rgba(253, 230, 138, 0.22)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {sefirot.map((node) => {
            const item = volumeMap[node.id];
            const activityCount = item?.actividades_total ?? 0;
            const scale = activityCount / maxActivityCount;
            const size = 52 + scale * 38;
            return (
              <div
                key={node.id}
                className={`absolute rounded-full flex flex-col items-center justify-center text-center border border-white/30 shadow-[0_0_20px_rgba(0,0,0,0.35)] ${node.colorClass}`}
                style={{
                  left: `${(node.x / 400) * 100}%`,
                  top: `${(node.y / 800) * 100}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  marginLeft: `${-size / 2}px`,
                  marginTop: `${-size / 2}px`,
                  transition: "width 300ms ease, height 300ms ease, margin 300ms ease",
                }}
                title={`${node.name}: ${activityCount} actividad(es), ${item?.horas_total ?? 0} h`}
              >
                <span className={`font-bold text-[10px] tracking-widest ${node.textClass}`}>{node.name.toUpperCase()}</span>
                <span className="text-[9px] text-white/90 mt-1">{activityCount}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-8 space-y-2 max-h-[230px] overflow-auto pr-2">
          {volume.map((item) => (
            <div key={item.sefira_id} className="flex items-center justify-between text-sm border border-stone-800/50 rounded-lg px-3 py-2 bg-stone-950/40">
              <span className="text-stone-300">{item.sefira_nombre}</span>
              <span className="text-amber-200">{item.actividades_total} act. / {item.horas_total} h</span>
            </div>
          ))}
        </div>
      </div>

      {/* OVERLAY */}
      <div
        className={`fixed inset-0 z-50 bg-[#0a0a0c]/85 backdrop-blur-md transition-opacity duration-300 ${isPanelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setIsPanelOpen(false)}
      ></div>

      {/* ASIDE */}
      <aside
        className={`fixed right-0 top-0 z-[70] h-full w-full max-w-[460px] bg-[#1a1d22] border-l border-stone-700/45 shadow-[0_24px_80px_rgba(0,0,0,0.6)] transition-transform duration-300 ${isPanelOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="h-full flex flex-col">
            <div className="px-6 py-5 border-b border-stone-700/35 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] font-label text-stone-400">Gestor de actividad</p>
                <h4 className="text-stone-100 font-semibold text-lg mt-2">{editingId ? "Editar actividad" : "Crear actividad"}</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsPanelOpen(false)}
                className="w-9 h-9 rounded-full border border-stone-700 text-stone-300 hover:bg-stone-800/60"
              >
                ×
              </button>
            </div>

            <form onSubmit={submitActivity} className="flex-1 overflow-auto px-6 py-6 space-y-5">
              <div>
                <label className='text-[10px] uppercase tracking-[0.18em] font-label text-stone-400'>Título</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Ej. Jesed Meditación"
                  className="mt-2 w-full bg-[#20242b] border border-stone-700/45 rounded-xl px-3 py-2.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[0.4fr_0.6fr] gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] font-label text-stone-400">Fecha</label>
                  <input
                    type="date" lang="es"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="mt-2 w-full bg-[#20242b] border border-stone-700/45 rounded-xl px-3 py-2.5 text-sm"
                  />
                  <p className="text-xs text-stone-500 mt-2">{formattedInputDate}</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] font-label text-stone-400">Horas</label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                      className="w-full bg-[#20242b] border border-stone-700/45 rounded-xl px-2 py-2.5 text-sm"
                    />
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                      className="w-full bg-[#20242b] border border-stone-700/45 rounded-xl px-2 py-2.5 text-sm"
                    />
                  </div>
                  <p className="text-xs text-amber-200/85 mt-2">{timeLabel}</p>
                </div>
              </div>

              <div>
                <label className='text-[10px] uppercase tracking-[0.18em] font-label text-stone-400'>Descripción</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe intención y foco energético..."
                  className="mt-2 w-full min-h-[110px] bg-[#20242b] border border-stone-700/45 rounded-xl px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.18em] font-label text-stone-400">Etiquetas Sefirot</label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sefirot.map((sefira) => {
                    const active = selectedSefirot.includes(sefira.id);
                    const color = SEFIRA_COLORS[sefira.id] ?? "#a3a3a3";
                    return (
                      <button
                        type="button"
                        key={sefira.id}
                        onClick={() => toggleSefira(sefira.id)}
                        className="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider border transition"
                        style={{
                          borderColor: active ? color : "rgba(120,120,120,0.5)",
                          background: active ? `${color}33` : "rgba(38,42,50,0.9)",
                          color: active ? "#f5f5f5" : "#b7bac1",
                          boxShadow: active ? `0 0 0 1px ${color}` : "none",
                        }}
                      >
                        {sefira.name.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-stone-500 mt-2">Selecciona una o más sefirot obligatoriamente.</p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-xl bg-amber-300 text-stone-900 font-semibold text-xs uppercase tracking-[0.18em] py-3 hover:bg-amber-200"
                  >
                    {editingId ? "Guardar cambios" : "Crear actividad"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setIsPanelOpen(false);
                    }}
                    className="rounded-xl border border-stone-700 text-stone-300 text-xs uppercase tracking-[0.14em] px-4"
                  >
                    Cancelar
                  </button>
                </div>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => deleteActivity(editingId)}
                    className="w-full rounded-xl bg-red-500/10 text-red-500 font-semibold text-[10px] uppercase tracking-[0.18em] py-3 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                  >
                    Borrar actividad
                  </button>
                )}
              </div>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}

