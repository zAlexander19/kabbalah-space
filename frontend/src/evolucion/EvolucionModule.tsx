import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Metrics, RangeOption } from './types';
import { useEvolucion } from './hooks/useEvolucion';
import RangeSelector from './components/RangeSelector';
import MetricToggle from './components/MetricToggle';
import SefiraEvolucionList from './components/SefiraEvolucionList';
import EvolucionChart from './components/EvolucionChart';

const ease = [0.16, 1, 0.3, 1] as const;

export default function EvolucionModule() {
  const [range, setRange] = useState<RangeOption>(12);
  const [metrics, setMetrics] = useState<Metrics>({ usuario: true, ia: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
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
              <EvolucionChart data={selected} metrics={metrics} />
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
