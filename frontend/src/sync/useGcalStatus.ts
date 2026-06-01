import { useEffect, useState } from 'react';
import { fetchSyncStatus } from './api';
import { useAuth } from '../auth';
import type { GcalStatus } from './types';

const POLL_INTERVAL_MS = 2000;

export function useGcalStatus(enabled: boolean = true): {
  status: GcalStatus | null;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const { status: authStatus } = useAuth();
  const [status, setStatus] = useState<GcalStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    try {
      const s = await fetchSyncStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Solo polleamos si el usuario está autenticado. Anónimo / loading no
    // tiene token válido — pollear genera 401s en loop hasta que el usuario
    // se logee.
    if (!enabled || authStatus !== 'authenticated') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refetch();
    };
    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, authStatus]);

  return { status, loading, refetch };
}
