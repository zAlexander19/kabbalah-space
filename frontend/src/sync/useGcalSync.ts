import { useCallback, useState } from 'react';
import {
  disconnectSync,
  fetchAuthorizeUrl,
  retryActividadSync,
  triggerBackfill,
} from './api';

export function useGcalSync() {
  const [working, setWorking] = useState(false);

  const connect = useCallback(async () => {
    setWorking(true);
    try {
      const url = await fetchAuthorizeUrl();
      window.location.href = url;
    } finally {
      setWorking(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setWorking(true);
    try {
      await disconnectSync();
    } finally {
      setWorking(false);
    }
  }, []);

  const backfill = useCallback(async () => {
    setWorking(true);
    try {
      await triggerBackfill();
    } finally {
      setWorking(false);
    }
  }, []);

  const retry = useCallback(async (id: string) => {
    await retryActividadSync(id);
  }, []);

  return { connect, disconnect, backfill, retry, working };
}
