import { useEffect, useState, useCallback } from 'react';
import { apiFetch, useAuth } from '../../auth';

export type LecturaStatus = 'weak' | 'balanced' | 'no_data' | 'disabled' | 'premium';

export type WeakSefira = {
  id: string;
  nombre: string;
  score: number;
};

export type LecturaResponse = {
  status: LecturaStatus;
  weak_sefirot: WeakSefira[];
  message: string | null;
};

/**
 * Fetch de la lectura mensual de KSpace-AI para el Calendario.
 * Re-fetcha cuando `dependency` cambia (ej. cuando se crea una actividad y
 * cambia el estado de una sefirá floja).
 */
export function useIaLectura(dependency?: unknown) {
  const { status } = useAuth();
  const [data, setData] = useState<LecturaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const reload = useCallback(async () => {
    if (status !== 'authenticated') {
      setData(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/ia/calendario/lectura');
      if (!res.ok) throw new Error('No se pudo cargar la lectura');
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [status]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, [reload, dependency]);

  return { data, loading, error, reload };
}
