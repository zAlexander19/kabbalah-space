// frontend/src/onboarding/useTourStep.ts
import { useEffect, type RefObject } from 'react';

import { useTourEspejo } from './TourEspejoContext';
import type { StepId } from './tour-espejo-steps';

/**
 * Registers the given ref as the target element of step `stepId`.
 *
 * Only runs when the tour is active — zero overhead during regular use of the
 * app. Pass `null` for the ref to opt out (useful when the same component is
 * rendered multiple times and only one instance should be the target).
 *
 * Uses `Element` (not `HTMLElement`) so SVG nodes (e.g. an `<g>` for a sefirá)
 * can also be tour targets.
 */
export function useTourStep(
  stepId: StepId,
  ref: RefObject<Element | null> | null,
): void {
  const tour = useTourEspejo();
  useEffect(() => {
    if (!tour.isActive) return;
    if (!ref) return;
    const cleanup = tour.registerTarget(stepId, ref as RefObject<HTMLElement>);
    return cleanup;
  }, [tour.isActive, stepId, ref, tour.registerTarget]);
}
