import { apiFetch } from '../auth/api';
import type { GcalStatus } from './types';

export async function fetchAuthorizeUrl(): Promise<string> {
  const r = await apiFetch('/sync/google/authorize');
  if (!r.ok) throw new Error(`authorize failed: ${r.status}`);
  const body = await r.json();
  return body.url;
}

export async function fetchSyncStatus(): Promise<GcalStatus> {
  const r = await apiFetch('/sync/status');
  if (!r.ok) throw new Error(`status failed: ${r.status}`);
  return r.json();
}

export async function disconnectSync(): Promise<void> {
  const r = await apiFetch('/sync/google/disconnect', { method: 'POST' });
  if (!r.ok) throw new Error(`disconnect failed: ${r.status}`);
}

export async function triggerBackfill(): Promise<void> {
  const r = await apiFetch('/sync/backfill', { method: 'POST' });
  if (!r.ok) throw new Error(`backfill failed: ${r.status}`);
}

export async function retryActividadSync(id: string): Promise<void> {
  const r = await apiFetch(`/actividades/${id}/retry-sync`, { method: 'POST' });
  if (!r.ok) throw new Error(`retry failed: ${r.status}`);
}
