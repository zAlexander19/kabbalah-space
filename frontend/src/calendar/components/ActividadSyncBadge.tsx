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

  // Only the two terminal states render. "pending" and "skipped" are
  // transient/internal and don't need a permanent indicator on each chip.
  if (status === 'pending' || status === 'skipped') return null;

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
  // status === 'error'
  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500/20 text-red-300 text-[10px] hover:bg-red-500/40 transition-colors ${
        retrying ? 'opacity-50 animate-pulse' : ''
      }`}
      title="No se sincronizó · click para reintentar"
      aria-label="Reintentar sincronización"
    >
      ⚠
    </button>
  );
}
