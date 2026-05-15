export type SyncStatus = 'pending' | 'synced' | 'error' | 'skipped';

export type GcalStatus = {
  enabled: boolean;
  calendar_name: string | null;
  last_sync_at: string | null;
  pending_count: number;
  error_count: number;
};
