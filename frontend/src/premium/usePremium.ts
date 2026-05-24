import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import { getBillingStatus } from './api';
import type { BillingStatus } from './types';

interface UsePremiumResult {
  status: BillingStatus | null;
  loading: boolean;
  error: string | null;
  isPremium: boolean;
  refetch: () => Promise<void>;
}

/**
 * Reads the current user's billing status from /billing/status.
 *
 * - Anonymous users: returns `{tier: 'free', subscription: null}` synthesized
 *   locally (no API call).
 * - Authenticated users: fetches on mount, then again whenever auth state changes.
 * - Exposes `refetch()` so callers can re-read after a known state change
 *   (e.g., after returning from checkout).
 */
export function usePremium(): UsePremiumResult {
  const auth = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      setStatus({ tier: 'free', subscription: null });
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getBillingStatus();
      if (mountedRef.current) {
        setStatus(result);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'unknown');
        // Fail safe: treat error as free so the user is not blocked from anything.
        setStatus({ tier: 'free', subscription: null });
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [auth.status]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    isPremium: status?.tier === 'premium',
    refetch: fetchStatus,
  };
}
