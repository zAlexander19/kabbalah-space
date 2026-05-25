import type { SubscriptionPlan } from './types';

interface PricingToggleProps {
  selected: SubscriptionPlan;
  onChange: (plan: SubscriptionPlan) => void;
}

const PRICES: Record<SubscriptionPlan, { amount: string; cadence: string; savings?: string }> = {
  monthly: { amount: 'USD 5.99', cadence: 'por mes' },
  yearly: { amount: 'USD 59.99', cadence: 'por año', savings: 'ahorrás 2 meses' },
};

export function PricingToggle({ selected, onChange }: PricingToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-full bg-stone-900/80 border border-stone-800/70">
      {(['monthly', 'yearly'] as const).map((plan) => {
        const active = selected === plan;
        const price = PRICES[plan];
        return (
          <button
            key={plan}
            type="button"
            onClick={() => onChange(plan)}
            aria-pressed={active}
            className={`relative px-5 py-2 rounded-full text-xs tracking-wide transition-colors ${
              active
                ? 'bg-amber-300/15 text-amber-100 border border-amber-300/40 shadow-[0_0_12px_rgba(233,195,73,0.15)]'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <span className="font-medium">{plan === 'monthly' ? 'Mensual' : 'Anual'}</span>
            <span className="ml-2 text-[10px] text-stone-500">{price.amount}</span>
            {plan === 'yearly' && (
              <span className="absolute -top-2 right-1 text-[9px] uppercase tracking-[0.14em] text-amber-300/80 bg-stone-950 px-2 py-0.5 rounded-full border border-amber-300/30">
                -2 meses
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
