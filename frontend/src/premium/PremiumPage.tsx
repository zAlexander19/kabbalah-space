import { useState } from 'react';
import { motion } from 'framer-motion';

import { useAuth } from '../auth/AuthContext';
import { createCheckout } from './api';
import { ComparisonTable } from './ComparisonTable';
import { PricingToggle } from './PricingToggle';
import { PromoBanner, usePromoFromUrl } from './PromoBanner';
import { usePremium } from './usePremium';
import type { SubscriptionPlan } from './types';

const ease = [0.16, 1, 0.3, 1] as const;

export function PremiumPage() {
  const auth = useAuth();
  const { isPremium } = usePremium();
  const promoCode = usePromoFromUrl();
  const [plan, setPlan] = useState<SubscriptionPlan>('yearly');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    if (auth.status !== 'authenticated') {
      auth.openLoginModal();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createCheckout({
        plan,
        promo_code: promoCode ?? undefined,
      });
      window.location.assign(result.checkout_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
      setSubmitting(false);
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

      {/* Pricing toggle + comparison + CTA (botón abajo de la info) */}
      <div className="bg-[#15181d] border border-stone-700/40 rounded-3xl p-6 md:p-10 space-y-7 shadow-2xl">
        <div className="flex justify-center">
          <PricingToggle selected={plan} onChange={setPlan} />
        </div>

        <ComparisonTable />

        <div className="border-t border-stone-800/70 pt-7 flex flex-col items-center gap-3">
          {isPremium ? (
            <p className="text-amber-100/90 text-sm">
              Ya tenés Premium activo. Gracias por estar acá.
            </p>
          ) : (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubscribe}
                className="px-10 py-3.5 rounded-full bg-gradient-to-br from-amber-200 via-amber-300 to-amber-400 hover:from-amber-100 hover:via-amber-200 hover:to-amber-300 text-stone-950 text-sm font-medium tracking-wide transition-all shadow-[0_4px_24px_rgba(233,195,73,0.4)] hover:shadow-[0_6px_32px_rgba(233,195,73,0.55)] ring-1 ring-amber-200/40 disabled:opacity-60 disabled:cursor-wait"
              >
                {submitting ? 'Abriendo checkout...' : 'Suscribirme a Premium'}
              </button>
              {error && (
                <p className="text-red-300 text-sm" role="alert">
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
