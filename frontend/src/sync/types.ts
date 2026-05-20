export type SyncStatus = 'pending' | 'synced' | 'error' | 'skipped';

export type SyncErrorEntry = {
  at: string;
  where: string;
  message: string;
};

export type GcalStatus = {
  enabled: boolean;
  calendar_name: string | null;
  last_sync_at: string | null;
  pending_count: number;
  error_count: number;
  recent_errors: SyncErrorEntry[];
};
