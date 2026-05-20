import { useEffect, useState, useCallback } from 'react';
import { apiFetch, useAuth } from '../../auth';
import type { SefiraSemanas } from '../types';

/**
 * Per-week breakdown for one sefirá in one month — feeds the "MES"
 * view of the chart (weekly actividades line + flat user/IA refs).
 *
 * Hook is a no-op (returns null data) until both sefiraId and mes are
 * provided, so callers can render it unconditionally and switch on the
 * data being non-null.
 */
export function useEvolucionMes(sefiraId: string | null, mes: string | null) {
  const { status } = useAuth();
  const [data, setData] = useState<SefiraSemanas | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const reload = useCallback(async () => {
    if (status !== 'authenticated' || !sefiraId || !mes) {
      setData(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/espejo/evolucion/${sefiraId}/semanas?mes=${mes}`);
      if (!res.ok) throw new Error('No se pudo cargar el detalle del mes');
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [sefiraId, mes, status]);

  useEffect(() => { void reload(); }, [reload]);

  return { data, loading, error, reload };
}
