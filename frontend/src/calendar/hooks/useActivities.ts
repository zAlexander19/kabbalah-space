import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../auth';
import type { Activity, VolumeItem, DateRange } from '../types';

function dateToYmd(d: Date): string {
  const offset = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return offset.toISOString().slice(0, 10);
}

// The backend strips timezone info from DateTime columns before persisting
// (see normalize_datetime in main.py). When Pydantic serializes a naive
// datetime, the JSON has no Z or offset suffix → the browser's `new Date()`
// would interpret it as LOCAL time, not UTC, and the activity would render
// shifted by the user's timezone offset (e.g. created at 2am local but
// rendered at 6am). Attaching 'Z' at the API boundary tells the browser
// "this is UTC", which round-trips correctly back to the user's local hour.
function attachUtcIfNaive(iso: string): string {
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) return iso;
  return iso + 'Z';
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
        apiFetch(`/actividades?start=${encodeURIComponent(startDate.toISOString())}&end=${encodeURIComponent(endDate.toISOString())}`),
        apiFetch(`/energia/volumen-semanal?fecha=${dateToYmd(range.start)}`),
      ]);

      if (!actRes.ok) throw new Error('No se pudieron cargar actividades');
      if (!volRes.ok) throw new Error('No se pudo cargar el volumen energético');

      const actData = await actRes.json();
      const volData = await volRes.json();

      // Normalize naive ISO datetimes from backend → UTC.
      const normalized: Activity[] = actData.map((a: Activity) => ({
        ...a,
        inicio: attachUtcIfNaive(a.inicio),
        fin: attachUtcIfNaive(a.fin),
      }));

      setActivities(normalized);
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
