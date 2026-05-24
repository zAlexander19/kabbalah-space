import { useState } from 'react';

import { getPortalUrl } from '../premium/api';
import { usePremium } from '../premium/usePremium';

interface SubscriptionSectionProps {
  onNavigateToPremium: () => void;
}

export function SubscriptionSection({ onNavigateToPremium }: SubscriptionSectionProps) {
  const { status, loading, isPremium } = usePremium();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpenPortal() {
    setOpening(true);
    setError(null);
    try {
      const url = await getPortalUrl();
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
      setOpening(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-[#15181d] border border-stone-700/40 rounded-2xl p-6">
        <p className="text-stone-400 text-sm">Cargando suscripción...</p>
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="bg-[#15181d] border border-stone-700/40 rounded-2xl p-6 space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-2">
            Suscripción
          </p>
          <h3 className="font-serif text-xl text-amber-100/95 mb-2">Sos usuario Free</h3>
          <p className="text-stone-400 text-sm">
            Premium libera reflexión sin tope, recurrencias en el calendario, IA personalizada y seguimiento por correo.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateToPremium}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/40 text-amber-100 text-xs tracking-wide transition-colors"
        >
          Ver planes Premium
        </button>
      </div>
    );
  }

  const sub = status?.subscription;
  const planLabel = sub?.plan === 'yearly' ? 'Anual' : 'Mensual';
  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  return (
    <div className="bg-[#15181d] border border-amber-300/20 rounded-2xl p-6 space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/70 mb-2">
          Suscripción Premium
        </p>
        <h3 className="font-serif text-xl text-amber-100/95 mb-3">Plan {planLabel} activo</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-400">Estado</dt>
            <dd className="text-stone-200">{sub?.status === 'trial' ? 'En trial' : 'Activo'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-400">Próximo cobro</dt>
            <dd className="text-stone-200">{periodEnd}</dd>
          </div>
          {sub?.canceled_at && (
            <div className="flex justify-between">
              <dt className="text-stone-400">Cancelado</dt>
              <dd className="text-amber-300/80">Acceso hasta {periodEnd}</dd>
            </div>
          )}
        </dl>
      </div>

      <button
        type="button"
        onClick={handleOpenPortal}
        disabled={opening}
        className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-xs tracking-wide transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          settings
        </span>
        {opening ? 'Abriendo portal...' : 'Gestionar suscripción'}
      </button>

      {error && (
        <p className="text-red-300 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
