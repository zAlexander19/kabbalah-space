import { useEffect, useState, useCallback } from 'react';
import { apiFetch, useAuth } from '../../auth';
import type { SefiraResumen } from '../types';

/**
 * Fetches the per-user espejo summary. Anonymous users have no summary,
 * so we skip the request entirely and return []. The caller (EspejoModule)
 * synthesizes a minimal resumen from the sefirot list when the user picks
 * a sefirá while still anonymous, so the carousel + drafts flow is reachable.
 */
export function useEspejoSummary() {
  const { status } = useAuth();
  const [summary, setSummary] = useState<SefiraResumen[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (status !== 'authenticated') {
      setSummary([]);
      return;
    }
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
  }, [status]);

  useEffect(() => { void reload(); }, [reload]);

  return { summary, loading, reload };
}
