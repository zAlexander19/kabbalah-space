import { useEffect, useState } from 'react';

/**
 * Reads a promo code from the URL `?promo=XYZ` query param and shows a banner.
 *
 * The actual validation happens server-side in /billing/checkout — this banner
 * is informational only. If the user submits and the code is invalid, they
 * see an error inline.
 */
export function usePromoFromUrl(): string | null {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const promo = params.get('promo');
    if (promo) setCode(promo.toUpperCase());
  }, []);

  return code;
}

interface PromoBannerProps {
  code: string;
}

export function PromoBanner({ code }: PromoBannerProps) {
  return (
    <div className="w-full rounded-2xl bg-amber-300/10 border border-amber-300/30 px-5 py-4 flex items-center gap-3">
      <span
        className="material-symbols-outlined text-amber-300 text-[20px]"
        aria-hidden="true"
      >
        local_offer
      </span>
      <div className="flex-1">
        <p className="text-amber-100 text-sm font-medium">
          7 días gratis con el código <span className="font-mono">{code}</span>
        </p>
        <p className="text-stone-300 text-xs mt-0.5">
          Al suscribirte se aplica automáticamente. Vas a poder cancelar antes de que termine el trial.
        </p>
      </div>
    </div>
  );
}
