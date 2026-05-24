import type { GateReason, GateError } from './types';

interface GateCopy {
  title: string;
  description: (detail: GateError | null) => string;
}

/**
 * Per-reason copy for the PremiumGate modal. Spanish, sin tono marketinero —
 * acorde a Templo Digital design language.
 */
export const GATE_COPY: Record<GateReason, GateCopy> = {
  actividad_limit: {
    title: 'Alcanzaste el límite del calendario',
    description: (detail) => {
      const max = detail?.max ?? 10;
      return `Las cuentas gratuitas pueden mantener hasta ${max} actividades activas. Premium las libera sin tope.`;
    },
  },
  recurrence_premium: {
    title: 'Las actividades recurrentes son Premium',
    description: () =>
      'Configurá ciclos repetidos (lunes a viernes, semanal, mensual) con la suscripción Premium.',
  },
  historico_premium: {
    title: 'Histórico extendido en Premium',
    description: () =>
      'Tu cuenta gratuita ve los últimos 12 meses de evolución. Premium libera el historial completo.',
  },
  free_reflection_limit: {
    title: 'Ya hiciste tu reflexión libre del mes',
    description: () =>
      'Las cuentas gratuitas pueden escribir una reflexión libre por mes. Premium te da reflexión sin límite.',
  },
  feature_premium_only: {
    title: 'Función exclusiva de Premium',
    description: () => 'Esta capacidad está disponible solo en cuentas Premium.',
  },
  respuesta_cooldown: {
    title: 'Esta pregunta vuelve más adelante',
    description: (detail) => {
      const date = detail?.next_available;
      return date
        ? `Volvé a responder esta pregunta el ${date}. Premium reduce el cooldown de 30 a 7 días.`
        : 'Premium reduce el cooldown de 30 a 7 días.';
    },
  },
};

export const PREMIUM_HIGHLIGHTS = [
  'Reflexión libre sin límite',
  'Calendario sin tope + recurrencias',
  'Análisis profundo con IA en cada reflexión',
  'Resumen semanal por correo',
];
