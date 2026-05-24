import { apiFetch } from '../auth/api';
import type {
  BillingStatus,
  CheckoutRequest,
  CheckoutResponse,
  ReflexionLibreCreate,
  ReflexionLibreOut,
} from './types';

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === 'string') return body.detail;
    if (body.detail && typeof body.detail.reason === 'string') return body.detail.reason;
  } catch {
    /* fall through */
  }
  return `HTTP ${res.status}`;
}

export async function getBillingStatus(): Promise<BillingStatus> {
  const res = await apiFetch('/billing/status');
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createCheckout(payload: CheckoutRequest): Promise<CheckoutResponse> {
  const res = await apiFetch('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getPortalUrl(): Promise<string> {
  const res = await apiFetch('/billing/portal');
  if (!res.ok) throw new Error(await parseError(res));
  const body = await res.json();
  return body.portal_url;
}

export async function createReflexionLibre(
  payload: ReflexionLibreCreate,
): Promise<ReflexionLibreOut> {
  const res = await apiFetch('/reflexiones-libres', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
