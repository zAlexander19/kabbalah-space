import { useState } from 'react';
import type { SyncStatus } from '../../sync/types';
import { useGcalSync } from '../../sync';

type Props = {
  actividadId: string;
  status: SyncStatus;
};

export default function ActividadSyncBadge({ actividadId, status }: Props) {
  const { retry } = useGcalSync();
  const [retrying, setRetrying] = useState(false);

  if (status === 'skipped') return null;

  const onRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(true);
    try {
      await retry(actividadId);
    } finally {
      setRetrying(false);
    }
  };

  if (status === 'synced') {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gold/15 text-gold text-[10px]"
        title="Sincronizado con Google Calendar"
        aria-label="Sincronizado"
      >
        ✓
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-stone-700/60 text-stone-400 text-[10px] animate-pulse"
        title="Sincronizando con Google"
        aria-label="Sincronizando"
      >
        ⋯
      </span>
    );
  }
  // status === 'error'
  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500/20 text-red-300 text-[10px] hover:bg-red-500/40 transition-colors"
      title="No se sincronizó · click para reintentar"
      aria-label="Reintentar sincronización"
    >
      {retrying ? '⋯' : '⚠'}
    </button>
  );
}
