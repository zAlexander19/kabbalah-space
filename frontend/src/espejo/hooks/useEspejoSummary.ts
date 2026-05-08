import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../auth';
import type { SefiraResumen } from '../types';

export function useEspejoSummary() {
  const [summary, setSummary] = useState<SefiraResumen[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/espejo/resumen');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { summary, loading, reload };
}
