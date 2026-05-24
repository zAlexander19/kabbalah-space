import { useState } from 'react';
import { motion } from 'framer-motion';

import { useAuth } from '../auth/AuthContext';
import { createCheckout } from './api';
import { ComparisonTable } from './ComparisonTable';
import { PromoBanner, usePromoFromUrl } from './PromoBanner';
import { usePremium } from './usePremium';
import type { SubscriptionPlan } from './types';

const ease = [0.16, 1, 0.3, 1] as const;

export function PremiumPage() {
  const auth = useAuth();
  const { isPremium } = usePremium();
  const promoCode = usePromoFromUrl();
  const [submitting, setSubmitting] = useState<SubscriptionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(plan: SubscriptionPlan) {
    if (auth.status !== 'authenticated') {
      auth.openLoginModal();
      return;
    }
    setSubmitting(plan);
    setError(null);
    try {
      const result = await createCheckout({
        plan,
        promo_code: promoCode ?? undefined,
      });
      window.location.assign(result.checkout_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
      setSubmitting(null);
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-10 md:py-14 space-y-12">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
        className="text-center space-y-4"
      >
        <h1 className="font-serif text-4xl md:text-5xl text-amber-100/95 leading-tight">
          Profundizá en vos.
        </h1>
        <p className="text-stone-300 text-base md:text-lg max-w-xl mx-auto">
          Acá están las herramientas. Para quienes ya saben que la cábala no se mira de afuera.
        </p>
      </motion.div>

      {promoCode && <PromoBanner code={promoCode} />}

      {/* Comparison + CTAs */}
      <div className="bg-[#15181d] border border-stone-700/40 rounded-3xl p-6 md:p-10 space-y-7 shadow-2xl">
        <ComparisonTable />

        <div className="border-t border-stone-800/70 pt-7 space-y-3">
          {isPremium ? (
            <p className="text-amber-100/90 text-sm text-center">
              Ya tenés Premium activo. Gracias por estar acá.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
                {/* ANUAL — destacado */}
                <button
                  type="button"
                  disabled={submitting !== null}
                  onClick={() => handleSubscribe('yearly')}
                  className="relative px-6 py-4 rounded-2xl bg-gradient-to-br from-amber-200 via-amber-300 to-amber-400 hover:from-amber-100 hover:via-amber-200 hover:to-amber-300 text-stone-950 transition-all shadow-[0_4px_24px_rgba(233,195,73,0.4)] hover:shadow-[0_6px_32px_rgba(233,195,73,0.55)] ring-1 ring-amber-200/40 disabled:opacity-60 disabled:cursor-wait flex flex-col items-center gap-1"
                >
                  <span className="absolute -top-2 right-3 text-[9px] uppercase tracking-[0.18em] font-medium text-amber-100 bg-stone-950 rounded-full px-2 py-0.5 border border-amber-300/40">
                    Recomendado
                  </span>
                  <span className="text-sm font-medium tracking-wide">
                    {submitting === 'yearly' ? 'Abriendo checkout...' : 'Suscribirme anual'}
                  </span>
                  <span className="text-xs text-stone-800/80">
                    USD 65.80 / año <span className="opacity-70">· ahorrás 2 meses</span>
                  </span>
                </button>

                {/* MENSUAL — sutil */}
                <button
                  type="button"
                  disabled={submitting !== null}
                  onClick={() => handleSubscribe('monthly')}
                  className="px-6 py-4 rounded-2xl bg-stone-900/60 hover:bg-stone-900/90 border border-stone-700/60 hover:border-amber-300/40 text-amber-100 transition-all disabled:opacity-60 disabled:cursor-wait flex flex-col items-center gap-1"
                >
                  <span className="text-sm font-medium tracking-wide">
                    {submitting === 'monthly' ? 'Abriendo checkout...' : 'Suscribirme mensual'}
                  </span>
                  <span className="text-xs text-stone-400">USD 6.58 / mes</span>
                </button>
              </div>

              {error && (
                <p className="text-red-300 text-sm text-center" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
