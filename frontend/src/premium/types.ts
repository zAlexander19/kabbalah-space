/**
 * Shared types for the premium / billing module.
 *
 * GateReason values must match the backend `reason` field in 402 responses.
 * Keep this in sync with backend/billing/dependencies.py + main.py gating sites.
 */

export type Tier = 'free' | 'premium';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | 'expired';

export type SubscriptionPlan = 'monthly' | 'yearly';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  current_period_end: string; // ISO 8601
  trial_ends_at: string | null;
  canceled_at: string | null;
}

export interface BillingStatus {
  tier: Tier;
  subscription: SubscriptionInfo | null;
}

/**
 * The `reason` field of a 402 response from the backend. The PremiumGate modal
 * uses this to pick the right contextual copy.
 *
 * NOTE: 'respuesta_cooldown' is a 409 (cooldown_active), not a 402. The modal
 * shows it for friendliness but it's a different status code.
 */
export type GateReason =
  | 'actividad_limit'
  | 'recurrence_premium'
  | 'historico_premium'
  | 'free_reflection_limit'
  | 'feature_premium_only'
  | 'respuesta_cooldown';

export interface GateError {
  error: 'premium_required' | 'cooldown_active';
  reason: GateReason;
  current?: number;
  max?: number;
  next_available?: string;
}

export interface CheckoutRequest {
  plan: SubscriptionPlan;
  promo_code?: string;
}

export interface CheckoutResponse {
  checkout_url: string;
}

export interface ReflexionLibreCreate {
  tipo: 'sefira' | 'arbol';
  sefira_id?: string;
  contenido: string;
}

export interface ReflexionLibreOut {
  id: string;
  tipo: 'sefira' | 'arbol';
  sefira_id: string | null;
  contenido: string;
  fecha_creacion: string; // ISO 8601
}
