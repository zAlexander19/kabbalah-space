import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Metrics, RangeOption } from './types';
import { useEvolucion } from './hooks/useEvolucion';
import RangeSelector from './components/RangeSelector';
import MetricToggle from './components/MetricToggle';
import SefiraEvolucionList from './components/SefiraEvolucionList';
import EvolucionChart from './components/EvolucionChart';
import EvolucionTimeline from './components/EvolucionTimeline';
import ArbolMesGrande, { type MesMetric } from './components/ArbolMesGrande';

const ease = [0.16, 1, 0.3, 1] as const;

type View = 'timeline' | 'month' | 'sefira';

function monthLabel(mesKey: string): string {
  const d = parse(`${mesKey}-01`, 'yyyy-MM-dd', new Date());
  const txt = format(d, 'MMMM yyyy', { locale: es });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export default function EvolucionModule() {
  const [range, setRange] = useState<RangeOption>(12);
  const [metrics, setMetrics] = useState<Metrics>({ usuario: true, ia: true, actividades: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>('timeline');
  const [pinnedMonth, setPinnedMonth] = useState<string | null>(null);
  const [mesMetric, setMesMetric] = useState<MesMetric>('usuario');

  const { data, loading, error } = useEvolucion(range);

  useEffect(() => {
    if (selectedId !== null) return;
    if (data.length === 0) return;
    const withData = data.find(s => s.meses.some(m => m.score_usuario !== null || m.score_ia !== null));
    setSelectedId((withData ?? data[0]).sefira_id);
  }, [data, selectedId]);

  const selected = useMemo(
    () => data.find(s => s.sefira_id === selectedId) ?? null,
    [data, selectedId]
  );

  // Snapshot of all 10 sefirot for the pinned month — used by ArbolMesGrande.
  const monthSnapshot = useMemo(() => {
    if (!pinnedMonth) return [];
    return data.map(sef => {
      const bucket = sef.meses.find(m => m.mes === pinnedMonth);
      return {
        sefira_id: sef.sefira_id,
        sefira_nombre: sef.sefira_nombre,
        score_usuario: bucket?.score_usuario ?? null,
        score_ia: bucket?.score_ia ?? null,
        actividades: bucket?.actividades ?? 0,
      };
    });
  }, [data, pinnedMonth]);

  // Aggregates for the pinned month header.
  const monthAggregates = useMemo(() => {
    if (!pinnedMonth) return null;
    let reflexiones = 0;
    let respuestas = 0;
    let actividades = 0;
    const scoresU: number[] = [];
    const scoresI: number[] = [];
    for (const sef of data) {
      const b = sef.meses.find(m => m.mes === pinnedMonth);
      if (!b) continue;
      reflexiones += b.reflexiones;
      respuestas += b.respuestas;
      actividades += b.actividades;
      if (b.score_usuario !== null) scoresU.push(b.score_usuario);
      if (b.score_ia !== null) scoresI.push(b.score_ia);
    }
    return {
      reflexiones,
      respuestas,
      actividades,
      promedioUsuario: scoresU.length === 0 ? null : scoresU.reduce((a, b) => a + b, 0) / scoresU.length,
      promedioIa: scoresI.length === 0 ? null : scoresI.reduce((a, b) => a + b, 0) / scoresI.length,
    };
  }, [data, pinnedMonth]);

  function handleMonthClick(mes: string) {
    setPinnedMonth(mes);
    setView('month');
  }

  function handleSefiraClickFromMonth(sefiraId: string) {
    setSelectedId(sefiraId);
    setView('sefira');
  }

  function handleBackToTimeline() {
    setView('timeline');
    setPinnedMonth(null);
  }

  function handleBackToMonth() {
    setView('month');
  }

  // ─── Timeline (primary) view ──────────────────────────────────────
  if (view === 'timeline') {
    return (
      <div className="w-full bg-[#15181d] border border-stone-700/40 rounded-[2rem] p-6 md:p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h2 className="font-serif text-3xl text-amber-100/90 tracking-tight">
              Promedio mensual general
            </h2>
            <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400 mt-1">
              Cada círculo es un mes — el árbol muestra el estado de cada dimensión
            </p>
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </div>

        {error && <p className="text-red-300 text-sm mb-3">{error}</p>}

        <AnimatePresence mode="wait">
          <motion.div
            key={`timeline-${range}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease }}
          >
            {loading && data.length === 0 ? (
              <p className="text-stone-400 text-sm font-serif italic text-center py-12">
                Cargando…
              </p>
            ) : (
              <EvolucionTimeline data={data} onMonthClick={handleMonthClick} />
            )}
          </motion.div>
        </AnimatePresence>

        <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mt-6 text-center">
          Click en un mes para ver el detalle por dimensión
        </p>
      </div>
    );
  }

  // ─── Month detail view ───────────────────────────────────────────
  if (view === 'month' && pinnedMonth) {
    const a = monthAggregates;
    return (
      <div className="w-full bg-[#15181d] border border-stone-700/40 rounded-[2rem] p-6 md:p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <button
              type="button"
              onClick={handleBackToTimeline}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] uppercase tracking-[0.14em] text-stone-300 hover:text-amber-200 hover:bg-stone-800/60 transition-colors mb-3 -ml-2"
            >
              <ChevronLeft size={14} />
              Volver al timeline
            </button>
            <h2 className="font-serif text-3xl text-amber-100/90 tracking-tight">
              {monthLabel(pinnedMonth)}
            </h2>
            {a && (
              <p className="text-[11px] uppercase tracking-[0.14em] text-stone-400 mt-1">
                {a.reflexiones} reflexión{a.reflexiones === 1 ? '' : 'es'}
                {' · '}
                {a.respuestas} respuesta{a.respuestas === 1 ? '' : 's'}
                {' · '}
                {a.actividades} actividad{a.actividades === 1 ? '' : 'es'}
                {a.promedioUsuario !== null && (
                  <>{' · '}<span className="text-amber-200/80">promedio {a.promedioUsuario.toFixed(1)}</span></>
                )}
              </p>
            )}
          </div>
          <MesMetricToggle value={mesMetric} onChange={setMesMetric} />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`month-${pinnedMonth}-${mesMetric}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease }}
          >
            <ArbolMesGrande
              snapshot={monthSnapshot}
              metric={mesMetric}
              onSefiraClick={handleSefiraClickFromMonth}
            />
          </motion.div>
        </AnimatePresence>

        <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mt-6 text-center">
          Click en una sefirá para ver su evolución completa
        </p>
      </div>
    );
  }

  // ─── Sefirá detail view (per-sefirá, with pinned month) ──────────
  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
      <div className="lg:col-span-12 flex items-center justify-between mb-2 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBackToTimeline}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-[0.14em] text-stone-300 hover:text-amber-200 hover:bg-stone-800/60 transition-colors"
          >
            <ChevronLeft size={14} />
            Timeline
          </button>
          {pinnedMonth && (
            <button
              type="button"
              onClick={handleBackToMonth}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-[0.14em] text-stone-300 hover:text-amber-200 hover:bg-stone-800/60 transition-colors"
            >
              <ChevronLeft size={14} />
              {monthLabel(pinnedMonth)}
            </button>
          )}
        </div>
      </div>

      <div className="lg:col-span-4 w-full bg-[#15181d] border border-stone-700/40 rounded-[2rem] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs uppercase tracking-[0.16em] text-stone-300">Dimensiones</h3>
          <RangeSelector value={range} onChange={setRange} />
        </div>
        {error && <p className="text-red-300 text-sm mb-3">{error}</p>}
        <SefiraEvolucionList
          data={data}
          selectedId={selectedId}
          metrics={metrics}
          onSelect={setSelectedId}
        />
      </div>

      <div className="lg:col-span-8 w-full bg-[#15181d] border border-stone-700/40 rounded-[2rem] p-6 md:p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-5 gap-4">
          <div>
            <h2 className="font-serif text-3xl text-amber-100/90 tracking-tight">
              {selected?.sefira_nombre ?? '—'}
            </h2>
            <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400 mt-1">
              Evolución mensual
            </p>
          </div>
          <MetricToggle value={metrics} onChange={setMetrics} />
        </div>

        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={selected.sefira_id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease }}
            >
              <EvolucionChart
                data={selected}
                metrics={metrics}
                pinnedMonth={pinnedMonth ?? undefined}
              />
            </motion.div>
          ) : (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-stone-400 text-sm font-serif italic text-center py-12"
            >
              {loading ? 'Cargando…' : 'Seleccioná una dimensión a la izquierda'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Single-select pill toggle for the month-detail view. Picks which metric
// drives the size/glow + value displayed on each tree node.
function MesMetricToggle({ value, onChange }: { value: MesMetric; onChange: (m: MesMetric) => void }) {
  const opts: { key: MesMetric; label: string; color: string }[] = [
    { key: 'usuario',     label: 'Usuario',     color: '#94a3b8' },
    { key: 'ia',          label: 'IA',          color: '#e9c349' },
    { key: 'actividades', label: 'Actividades', color: '#86efac' },
  ];
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {opts.map(o => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.12em] border transition-colors"
            style={{
              borderColor: active ? o.color : 'rgba(120,120,120,0.4)',
              background: active ? `${o.color}22` : 'transparent',
              color: active ? '#f5f5f5' : '#a8a29e',
            }}
            aria-pressed={active}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: o.color }} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
