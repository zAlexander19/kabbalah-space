import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useGate } from './PremiumGateContext';
import { getBillingStatus } from './api';
import { usePremium } from './usePremium';
import { useAuth } from '../auth';
import { useScrollLock } from '../shared/hooks/useScrollLock';

const ease = [0.16, 1, 0.3, 1] as const;

// Aparece una vez por entrada a la app (cada carga de página), tras un rato
// de uso. Sin cooldown entre días: si el usuario entra 3 veces, lo ve 3 veces.
// El único freno es el delay en-app (que se vea que hubo uso, no un pop seco
// al abrir).
const SHOW_DELAY_MS = 45_000;
const RECHECK_MS = 15_000;

// Paleta del diseño "1b — Editorial split" (champagne, más apagado que el
// dorado del resto de la app — es deliberado, viene del mock aprobado).
const GOLD = '#C6A15B';
const GOLD_SOFT = 'rgba(198,161,91,0.14)';
const GOLD_LINE = 'rgba(198,161,91,0.22)';

const FEATURES: { title: string; detail: string }[] = [
  { title: 'Reflexión libre, sin límite', detail: 'Escribí sin contador ni cortes.' },
  { title: 'Calendario sin tope + recurrencias', detail: 'Eventos ilimitados y repetibles.' },
  { title: 'Análisis con IA en cada reflexión', detail: 'Una lectura profunda de lo que escribís.' },
  { title: 'Resumen semanal por correo', detail: 'Tu semana, sintetizada, cada domingo.' },
];

type Billing = 'mes' | 'anual';

const PRICE: Record<Billing, { big: string; suffix: string; note: string }> = {
  mes: {
    big: 'USD 5.99',
    suffix: '/mes',
    note: 'Se renueva cada mes · cancelás cuando quieras',
  },
  anual: {
    big: 'USD 59.99',
    suffix: '/año',
    note: 'Equivale a USD 5.00/mes · ahorrás 2 meses',
  },
};

interface Props {
  /** El caller (App) sabe cuándo NO molestar: tour activo, intro, login
   * modal abierto, vistas admin/cuenta. */
  suppressed: boolean;
}

/**
 * Popup promocional de Premium para usuarios free/anónimos.
 * Diseño "1b — Editorial split": rail izquierdo con logo + frase, derecha con
 * features, toggle mensual/anual y precio. Aparece 45s después de entrar a la
 * app, una vez por carga de página. Nunca se muestra a usuarios premium
 * (verificación fresca del tier al momento de mostrarse) ni sobre otro modal.
 */
export function PremiumPromoPopup({ suppressed }: Props) {
  const { openPlans, isPlansOpen, isOpen: isGateOpen } = useGate();
  const { isPremium, status } = usePremium();
  const auth = useAuth();
  const [visible, setVisible] = useState(false);
  const [billing, setBilling] = useState<Billing>('anual');
  const reducedMotion = useReducedMotion();
  const ctaRef = useRef<HTMLButtonElement>(null);
  // Se setea en un effect (no en render) para cumplir react-hooks/purity.
  const mountedAt = useRef<number>(0);
  // Una vez por carga de página (in-memory, no persiste): evita que reaparezca
  // cada 15s tras cerrarlo, pero un reload/reingreso lo vuelve a disparar.
  const shownThisLoad = useRef(false);

  const blocked = suppressed || isPlansOpen || isGateOpen;

  useScrollLock(visible);

  useEffect(() => {
    if (mountedAt.current === 0) mountedAt.current = Date.now();
  }, []);

  useEffect(() => {
    // status === null: todavía no sabemos el tier — no decidir con eso.
    if (visible || isPremium || status === null || shownThisLoad.current) return;

    const tryShow = async () => {
      if (blocked || shownThisLoad.current) return;
      // No montar con la pestaña oculta: las animaciones (rAF) están
      // congeladas y el popup aparecería a medio renderizar al volver.
      if (document.visibilityState !== 'visible') return;
      // No montar sobre la LoadingScreen de la landing (rAF-driven; si el
      // navegador la frena, puede seguir activa mucho después del load).
      if (document.querySelector('[aria-label="Cargando la bienvenida"]')) return;
      if (mountedAt.current === 0 || Date.now() - mountedAt.current < SHOW_DELAY_MS) return;
      // Reclamar el one-shot ANTES del await: evita doble disparo del interval.
      shownThisLoad.current = true;
      // Verificación fresca al momento de mostrar: el `isPremium` del mount
      // puede estar viejo (compra o grant de premium a mitad de sesión, o un
      // fetch fallido que cayó al fail-safe 'free'). Nunca molestar a un
      // usuario que YA es premium; ante la duda (error), no mostrar.
      if (auth.status === 'authenticated') {
        try {
          const fresh = await getBillingStatus();
          if (fresh.tier === 'premium') return;
        } catch {
          return;
        }
      }
      setVisible(true);
    };

    const id = window.setInterval(() => void tryShow(), RECHECK_MS);
    return () => window.clearInterval(id);
  }, [visible, isPremium, status, blocked, auth.status]);

  const close = useCallback(() => setVisible(false), []);

  // Escape cierra + foco inicial en el CTA (mismo patrón que LoginModal).
  useEffect(() => {
    if (!visible) return;
    ctaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, close]);

  const price = PRICE[billing];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="promo-overlay"
          className="fixed inset-0 z-[85] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.2, ease }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />
          {/* Glow dorado detrás de la tarjeta (mock 1b) */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 bottom-[10%] -translate-x-1/2 w-[500px] h-[300px] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(198,161,91,0.20), transparent 70%)',
              filter: 'blur(12px)',
            }}
          />

          <motion.div
            key="promo-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="premium-promo-title"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 18, scale: reducedMotion ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : 10, scale: reducedMotion ? 1 : 0.98 }}
            transition={{ duration: reducedMotion ? 0 : 0.28, ease }}
            className="relative w-full max-w-[660px] max-h-[90vh] overflow-y-auto flex rounded-[18px]"
            style={{
              background: 'linear-gradient(180deg, #17140f 0%, #100e0a 100%)',
              border: `1px solid ${GOLD_LINE}`,
              boxShadow: '0 40px 90px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {/* Rail izquierdo — logo + frase (oculto en mobile) */}
            <div
              className="hidden sm:flex flex-none w-[236px] flex-col justify-between p-7"
              style={{
                background:
                  'radial-gradient(120% 80% at 30% 20%, rgba(198,161,91,0.16), transparent 60%), linear-gradient(180deg, #14110b, #0d0b07)',
                borderRight: `1px solid ${GOLD_LINE}`,
              }}
            >
              <div className="flex items-center gap-2.5">
                <img
                  src="/kabbalah-sapece-logo.png"
                  alt=""
                  aria-hidden="true"
                  className="w-[30px] h-[30px] object-contain"
                />
                <span
                  className="text-[11px] uppercase font-semibold"
                  style={{ letterSpacing: '0.2em', color: GOLD }}
                >
                  Premium
                </span>
              </div>

              <div className="flex justify-center items-center my-2">
                <div
                  className="w-[130px] h-[130px] rounded-full flex items-center justify-center"
                  style={{ background: 'radial-gradient(circle, rgba(198,161,91,0.22), transparent 68%)' }}
                >
                  <img
                    src="/kabbalah-sapece-logo.png"
                    alt=""
                    aria-hidden="true"
                    className="w-[92px] h-[92px] object-contain opacity-95"
                    style={{ filter: 'drop-shadow(0 4px 16px rgba(198,161,91,0.35))' }}
                  />
                </div>
              </div>

              <div>
                <div className="font-serif text-[21px] leading-tight text-[#F3EFE7] font-medium">
                  La cábala <em>no se mira de afuera</em>.
                </div>
                <div className="text-xs text-[#F3EFE7]/45 mt-2 leading-relaxed">
                  Para quienes ya decidieron entrar.
                </div>
              </div>
            </div>

            {/* Contenido derecho */}
            <div className="flex-1 relative px-6 sm:px-8 pt-8 pb-7">
              <button
                type="button"
                onClick={close}
                aria-label="Cerrar"
                className="absolute top-5 right-5 w-8 h-8 rounded-lg flex items-center justify-center text-[#F3EFE7]/45 hover:text-[#F3EFE7] hover:bg-white/5 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
              </button>

              <h2
                id="premium-promo-title"
                className="font-serif text-[30px] leading-[1.1] text-[#F3EFE7] font-medium mb-5 max-w-[300px]"
              >
                Profundizá tu <em>práctica</em>
              </h2>

              <ul className="flex flex-col gap-[15px] mb-6">
                {FEATURES.map((f) => (
                  <li key={f.title} className="flex items-start gap-3">
                    <svg
                      className="flex-none mt-[1px]"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={GOLD}
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                    <div>
                      <div className="text-sm font-semibold text-[#F3EFE7]">{f.title}</div>
                      <div className="text-[12.5px] text-[#F3EFE7]/50 mt-px">{f.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Toggle mensual / anual */}
              <div
                className="relative inline-flex rounded-full p-[3px] mb-[18px]"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                role="group"
                aria-label="Frecuencia de facturación"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-[3px] bottom-[3px] left-[3px] w-[calc(50%-3px)] rounded-full transition-transform duration-300"
                  style={{
                    background: GOLD_SOFT,
                    border: `1px solid ${GOLD_LINE}`,
                    transform: billing === 'anual' ? 'translateX(100%)' : 'translateX(0%)',
                    transitionTimingFunction: 'cubic-bezier(0.4,0,0.2,1)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setBilling('mes')}
                  aria-pressed={billing === 'mes'}
                  className="relative z-[1] text-[12.5px] font-semibold text-[#F3EFE7] px-[18px] py-1.5 rounded-full"
                >
                  Mensual
                </button>
                <button
                  type="button"
                  onClick={() => setBilling('anual')}
                  aria-pressed={billing === 'anual'}
                  className="relative z-[1] inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#F3EFE7] px-4 py-1.5 rounded-full"
                >
                  Anual
                  <span className="text-[10px] font-bold" style={{ color: GOLD }}>−17%</span>
                </button>
              </div>

              {/* Precio + CTA */}
              <div
                className="flex items-end justify-between gap-4 pt-[18px]"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-serif text-[30px] font-semibold text-[#F3EFE7]">{price.big}</span>
                    <span className="text-[13px] text-[#F3EFE7]/50">{price.suffix}</span>
                  </div>
                  <div className="text-[11.5px] text-[#F3EFE7]/40 mt-0.5">{price.note}</div>
                </div>
                <button
                  ref={ctaRef}
                  type="button"
                  onClick={() => {
                    close();
                    openPlans();
                  }}
                  className="flex-none text-sm font-bold text-[#1a1509] px-[26px] py-[13px] rounded-full transition-[filter] hover:brightness-105"
                  style={{
                    background: `linear-gradient(180deg, #E8CE85 0%, ${GOLD} 100%)`,
                    boxShadow: '0 6px 20px rgba(198,161,91,0.28)',
                  }}
                >
                  Ver planes
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
