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

const FAQ = [
  {
    q: '¿Cómo cancelo?',
    a: 'Desde "Mi cuenta → Suscripción" hacés un click en "Gestionar suscripción" y cancelás cuando quieras. Mantenés el acceso hasta el final del período que pagaste.',
  },
  {
    q: '¿Qué pasa con mis datos si cancelo?',
    a: 'Tus reflexiones, actividades y evolución siguen siendo tuyas. Volvés al tier gratis con sus límites, pero no perdés nada de tu historia.',
  },
  {
    q: '¿Cuándo se cobra?',
    a: 'Si entraste con un código de 7 días gratis, el cobro empieza al octavo día (podés cancelar antes sin costo). Si no, el cobro es inmediato al suscribirte.',
  },
  {
    q: '¿Hay reembolsos?',
    a: 'No automáticos. Si tenés un caso especial, escribínos y lo revisamos a mano.',
  },
];

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

      {/* Pricing + CTA */}
      <div className="bg-[#15181d] border border-stone-700/40 rounded-3xl p-6 md:p-10 space-y-6 shadow-2xl">
        <div className="flex flex-col items-center gap-5">
          <PricingToggle selected={plan} onChange={setPlan} />

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
                className="px-8 py-3 rounded-full bg-amber-300/20 hover:bg-amber-300/30 border border-amber-300/50 text-amber-50 text-sm tracking-wide transition-colors shadow-[0_0_20px_rgba(233,195,73,0.25)] disabled:opacity-60 disabled:cursor-wait"
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

        <div className="border-t border-stone-800/70 pt-6">
          <ComparisonTable />
        </div>
      </div>

      {/* FAQ */}
      <div className="space-y-4">
        <h2 className="font-serif text-2xl text-amber-100/90 text-center mb-6">
          Preguntas que tal vez tengas
        </h2>
        {FAQ.map((item) => (
          <details
            key={item.q}
            className="group bg-stone-950/60 border border-stone-800/60 rounded-xl px-5 py-4"
          >
            <summary className="cursor-pointer text-stone-200 text-sm font-medium list-none flex items-center justify-between">
              <span>{item.q}</span>
              <span
                className="material-symbols-outlined text-stone-500 text-[18px] transition-transform group-open:rotate-180"
                aria-hidden="true"
              >
                expand_more
              </span>
            </summary>
            <p className="mt-3 text-stone-400 text-sm leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
