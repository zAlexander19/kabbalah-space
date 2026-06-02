// frontend/src/onboarding/TourTooltip.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { useTourEspejo } from './TourEspejoContext';
import { STEPS, type StepPlacement, type TourStep } from './tour-espejo-steps';

const ease = [0.16, 1, 0.3, 1] as const;

const TOOLTIP_WIDTH = 280;
const TOOLTIP_OFFSET = 12; // distance from target rect edge
const MOBILE_BREAKPOINT = 640;
const VIEWPORT_PADDING = 8;

type Position = { top: number; left: number; placement: StepPlacement };

function computePosition(
  rect: DOMRect,
  preferred: StepPlacement,
  viewport: { w: number; h: number },
  tooltipHeight: number,
): Position {
  const isMobile = viewport.w < MOBILE_BREAKPOINT;
  if (isMobile) {
    // On mobile, place below if it fits, otherwise above. Keeps the tooltip
    // visually connected to the target (e.g. paso 5 — historial — is near the
    // bottom of the page).
    const placeBelow = rect.bottom + TOOLTIP_OFFSET + tooltipHeight + VIEWPORT_PADDING <= viewport.h;
    return placeBelow
      ? { top: rect.bottom + TOOLTIP_OFFSET, left: VIEWPORT_PADDING, placement: 'bottom' }
      : { top: Math.max(VIEWPORT_PADDING, rect.top - TOOLTIP_OFFSET - tooltipHeight), left: VIEWPORT_PADDING, placement: 'top' };
  }

  const tryPlacement = (p: StepPlacement): Position | null => {
    let top = 0;
    let left = 0;
    if (p === 'right') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + TOOLTIP_OFFSET;
    } else if (p === 'left') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - TOOLTIP_OFFSET - TOOLTIP_WIDTH;
    } else if (p === 'top') {
      top = rect.top - TOOLTIP_OFFSET - tooltipHeight;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    } else {
      top = rect.bottom + TOOLTIP_OFFSET;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    }
    // Check it fits inside viewport (with padding).
    if (
      top < VIEWPORT_PADDING ||
      left < VIEWPORT_PADDING ||
      top + tooltipHeight > viewport.h - VIEWPORT_PADDING ||
      left + TOOLTIP_WIDTH > viewport.w - VIEWPORT_PADDING
    ) {
      return null;
    }
    return { top, left, placement: p };
  };

  const opposite: Record<StepPlacement, StepPlacement> = {
    right: 'left',
    left: 'right',
    top: 'bottom',
    bottom: 'top',
  };

  return (
    tryPlacement(preferred) ??
    tryPlacement(opposite[preferred]) ?? {
      // Fallback: clamp to bottom of the viewport.
      top: viewport.h - tooltipHeight - VIEWPORT_PADDING,
      left: Math.max(VIEWPORT_PADDING, Math.min(rect.left, viewport.w - TOOLTIP_WIDTH - VIEWPORT_PADDING)),
      placement: 'bottom',
    }
  );
}

function ArrowSvg({ placement }: { placement: StepPlacement }) {
  // Triangle pointing toward the target. CSS rotation based on placement.
  const rotate = {
    right: 0,
    left: 180,
    top: 90,
    bottom: -90,
  }[placement];
  const style: React.CSSProperties = {
    position: 'absolute',
    width: 12,
    height: 12,
    transform: `rotate(${rotate}deg)`,
    ...(placement === 'right' ? { left: -6, top: '50%', marginTop: -6 } : {}),
    ...(placement === 'left' ? { right: -6, top: '50%', marginTop: -6 } : {}),
    ...(placement === 'top' ? { bottom: -6, left: '50%', marginLeft: -6 } : {}),
    ...(placement === 'bottom' ? { top: -6, left: '50%', marginLeft: -6 } : {}),
  };
  return (
    <svg viewBox="0 0 12 12" style={style} aria-hidden="true">
      <polygon points="12,0 0,6 12,12" fill="#0c0d11" stroke="rgba(233,195,73,0.4)" strokeWidth="1" />
    </svg>
  );
}

export function TourTooltip() {
  const tour = useTourEspejo();
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState<Position | null>(null);
  const [viewport, setViewport] = useState({
    w: typeof window === 'undefined' ? 1024 : window.innerWidth,
    h: typeof window === 'undefined' ? 768 : window.innerHeight,
  });
  // Rect del target — usado para el spotlight backdrop. Se mantiene sincronizado
  // con `position` (mismo effect lo actualiza en scroll/resize).
  const [targetRect, setTargetRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const step = useMemo<TourStep | null>(() => {
    if (!tour.isActive || tour.currentStep === null) return null;
    return STEPS.find((s) => s.id === tour.currentStep) ?? null;
  }, [tour.isActive, tour.currentStep]);

  const targetRef = step ? tour.getTargetRef(step.id) : null;
  const targetEl = targetRef?.current ?? null;

  // Recompute position + target rect whenever the step, target element, or
  // viewport changes.
  useLayoutEffect(() => {
    if (!step || !targetEl) {
      setPosition(null);
      setTargetRect(null);
      return;
    }
    const update = () => {
      const rect = targetEl.getBoundingClientRect();
      // Approximate tooltip height — copy length and step mode determine it.
      const approxHeight = step.mode === 'linear' ? 160 : 110;
      setPosition(computePosition(rect, step.placement, viewport, approxHeight));
      setTargetRect({ x: rect.left, y: rect.top, w: rect.width, h: rect.height });
    };
    update();
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setViewport({ w, h });
      const rect = targetEl.getBoundingClientRect();
      const approxHeight = step.mode === 'linear' ? 160 : 110;
      setPosition(computePosition(rect, step.placement, { w, h }, approxHeight));
      setTargetRect({ x: rect.left, y: rect.top, w: rect.width, h: rect.height });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', update, true);
    };
  }, [step, targetEl, viewport.w, viewport.h]);

  // Attach advance listener for contextual / target-click steps.
  // tour.next is stashed in a ref so we don't re-attach the listener on every
  // context value change (which would happen each time targetsVersion bumps).
  const nextRef = useRef(tour.next);
  useEffect(() => {
    nextRef.current = tour.next;
  }, [tour.next]);
  useEffect(() => {
    if (!step || !targetEl) return;
    if (step.advanceOn === 'next-button') return;
    const handler = () => nextRef.current();
    const eventName = step.advanceOn === 'target-focus' ? 'focus' : 'click';
    targetEl.addEventListener(eventName, handler, { once: true });
    return () => targetEl.removeEventListener(eventName, handler);
  }, [step, targetEl]);

  // Auto-close timer for the last step (paso 5) when target never appears or
  // user doesn't interact.
  useEffect(() => {
    if (!step || !step.autoCloseAfterMs) return;
    const timer = setTimeout(() => tour.skip(), step.autoCloseAfterMs);
    return () => clearTimeout(timer);
  }, [step, tour]);

  // Auto-pause when a higher-z modal opens (PremiumGate z-100, AnswersGridModal
  // z-110, etc). We don't reposition or remount — we just hide the tooltip and
  // let it reappear when the modal closes.
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!tour.isActive) return;
    const check = () => {
      // Excluir contenedores que marcan data-tour-pause="false" — esos son
      // modales que ALOJAN targets del tour adentro (ej. SefiraDetailMobileSheet
      // contiene el textarea del paso 3 en mobile), así que pausar el tooltip
      // cuando se abren lo dejaría inalcanzable.
      const modals = document.querySelectorAll('[aria-modal="true"]:not([data-tour-pause="false"])');
      setIsPaused(modals.length > 0);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'data-tour-pause'],
    });
    return () => observer.disconnect();
  }, [tour.isActive]);

  if (!step || !position) return null;

  const motionDuration = reducedMotion ? 0 : 0.22;

  // Spotlight padding alrededor del target (px de aire antes del oscuro).
  const SPOTLIGHT_PADDING = 12;
  const SPOTLIGHT_RADIUS = 16;

  return createPortal(
    <>
      <AnimatePresence>
        {targetRect && (
          <motion.svg
            key={`overlay-${step.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: isPaused ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDuration, ease }}
            className="fixed inset-0 z-[75] pointer-events-none"
            width="100%"
            height="100%"
            aria-hidden="true"
          >
            <defs>
              <mask id={`tour-spotlight-${step.id}`}>
                {/* blanco = oscurecido, negro = hueco (nítido sobre el target) */}
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.x - SPOTLIGHT_PADDING}
                  y={targetRect.y - SPOTLIGHT_PADDING}
                  width={targetRect.w + SPOTLIGHT_PADDING * 2}
                  height={targetRect.h + SPOTLIGHT_PADDING * 2}
                  rx={SPOTLIGHT_RADIUS}
                  ry={SPOTLIGHT_RADIUS}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.65)"
              mask={`url(#tour-spotlight-${step.id})`}
            />
          </motion.svg>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: isPaused ? 0 : 1, scale: isPaused ? 0.95 : 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: motionDuration, ease }}
          className="fixed z-[80] pointer-events-none"
          style={{
            top: position.top,
            left: position.left,
            width: viewport.w < MOBILE_BREAKPOINT ? viewport.w - VIEWPORT_PADDING * 2 : TOOLTIP_WIDTH,
          }}
          role="dialog"
          aria-modal="false"
          aria-label={`Tour del Espejo, paso ${step.id} de ${STEPS.length}`}
        >
        <div
          className="relative pointer-events-auto rounded-2xl bg-stone-950/95 border border-amber-300/40 shadow-[0_24px_60px_rgba(0,0,0,0.6)] px-5 py-4 backdrop-blur-md"
        >
          <ArrowSvg placement={position.placement} />
          <p className="text-[10px] uppercase tracking-[0.2em] text-amber-200/70 mb-2">
            Paso {step.id} de {STEPS.length}
          </p>
          <p className="font-serif text-base text-amber-50 leading-snug mb-4">{step.copy}</p>
          {step.mode === 'linear' && (
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={tour.skip}
                className="text-xs text-stone-400 hover:text-stone-200 tracking-wide transition-colors"
              >
                Saltar tour
              </button>
              {step.advanceOn === 'next-button' && (
                <button
                  type="button"
                  onClick={tour.next}
                  className="px-4 py-1.5 rounded-full bg-amber-300/20 hover:bg-amber-300/35 border border-amber-300/50 text-amber-50 text-xs tracking-wide transition-colors"
                >
                  Siguiente →
                </button>
              )}
            </div>
          )}
        </div>
        </motion.div>
      </AnimatePresence>
    </>,
    document.body,
  );
}
