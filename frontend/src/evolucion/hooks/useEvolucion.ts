import { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '../../shared/tokens';
import type { SefiraEvolucion, RangeOption } from '../types';
import { RANGE_TO_MESES } from '../types';

export function useEvolucion(range: RangeOption) {
  const [data, setData] = useState<SefiraEvolucion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const meses = RANGE_TO_MESES[range];
      const res = await fetch(`${API_BASE}/espejo/evolucion?meses=${meses}`);
      if (!res.ok) throw new Error('No se pudo cargar la evolución');
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void reload(); }, [reload]);

  return { data, loading, error, reload };
}
