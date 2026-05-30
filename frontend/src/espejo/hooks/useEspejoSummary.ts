import { useEffect, useState, useCallback, useRef } from 'react';
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
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    if (status !== 'authenticated') {
      setSummary([]);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await apiFetch('/espejo/resumen', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res.ok) {
        const data = await res.json();
        if (!controller.signal.aborted) setSummary(data);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      throw e;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  return { summary, loading, reload };
}
