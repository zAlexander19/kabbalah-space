import { useEffect, useState } from 'react';
import { getStats, type AdminStats } from '../api';

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-stone-900/60 border border-stone-800/40 rounded-xl p-4">
      <p className="text-stone-500 text-[10px] uppercase tracking-[0.16em] mb-1">{label}</p>
      <p className="text-amber-100 text-2xl font-serif">{value}</p>
    </div>
  );
}

export function StatsPanel() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStats().then(setStats).catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <p className="text-red-400/80 text-sm">{error}</p>;
  if (!stats) return <p className="text-stone-400 text-sm">Cargando…</p>;

  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-3 border-b border-stone-800/60 pb-2">Usuarios</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Total" value={stats.usuarios.total} />
          <Card label="Nuevos hoy" value={stats.usuarios.nuevos_hoy} />
          <Card label="Nuevos (7d)" value={stats.usuarios.nuevos_semana} />
          <Card label="Nuevos (30d)" value={stats.usuarios.nuevos_mes} />
          <Card label="Email" value={stats.usuarios.por_provider.email ?? 0} />
          <Card label="Google" value={stats.usuarios.por_provider.google ?? 0} />
          <Card label="Premium" value={stats.usuarios.premium} />
        </div>
      </section>

      <section>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-3 border-b border-stone-800/60 pb-2">Actividad</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card label="Reflexiones" value={stats.actividad.reflexiones_total} />
          <Card label="Respuestas" value={stats.actividad.respuestas_total} />
          <Card label="Actividades" value={stats.actividad.actividades_total} />
          <Card label="Activos (7d)" value={stats.actividad.usuarios_activos_7d} />
          <Card label="Activos (30d)" value={stats.actividad.usuarios_activos_30d} />
          <Card label="Sync GCal" value={stats.actividad.gcal_sync_activos} />
        </div>
      </section>

      <section>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-3 border-b border-stone-800/60 pb-2">Premium</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card label="Activos" value={stats.premium.activos} />
          <Card label="Trial" value={stats.premium.trial} />
          <Card label="Cancelados" value={stats.premium.cancelados} />
        </div>
      </section>
    </div>
  );
}
