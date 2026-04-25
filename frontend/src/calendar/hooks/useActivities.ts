import { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '../tokens';
import type { Activity, VolumeItem, DateRange } from '../types';

function dateToYmd(d: Date): string {
  const offset = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return offset.toISOString().slice(0, 10);
}

export function useActivities(range: DateRange) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [volume, setVolume] = useState<VolumeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const startDate = new Date(range.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(range.end);
      endDate.setDate(endDate.getDate() + 1);
      endDate.setHours(0, 0, 0, 0);

      const [actRes, volRes] = await Promise.all([
        fetch(`${API_BASE}/actividades?start=${encodeURIComponent(startDate.toISOString())}&end=${encodeURIComponent(endDate.toISOString())}`),
        fetch(`${API_BASE}/energia/volumen-semanal?fecha=${dateToYmd(range.start)}`),
      ]);

      if (!actRes.ok) throw new Error('No se pudieron cargar actividades');
      if (!volRes.ok) throw new Error('No se pudo cargar el volumen energético');

      const actData = await actRes.json();
      const volData = await volRes.json();
      setActivities(actData);
      setVolume(volData.volumen ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end]);

  useEffect(() => {
    load();
  }, [load]);

  return { activities, volume, loading, error, reload: load, setError };
}
