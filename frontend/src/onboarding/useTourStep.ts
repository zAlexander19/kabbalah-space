// frontend/src/onboarding/useTourStep.ts
import { useEffect, type RefObject } from 'react';

import { useTourEspejo } from './TourEspejoContext';
import type { StepId } from './tour-espejo-steps';

/**
 * Registers the given ref as the target element of step `stepId`.
 *
 * Only runs when the tour is active — zero overhead during regular use of the
 * app. Re-registers if the ref or stepId changes. Cleans up on unmount, which
 * is what lets the tooltip silently wait when a target's component hasn't
 * mounted yet (e.g. the question carousel only mounts after the user clicks a
 * sefirá).
 */
export function useTourStep(stepId: StepId, ref: RefObject<HTMLElement>): void {
  const tour = useTourEspejo();
  useEffect(() => {
    if (!tour.isActive) return;
    const cleanup = tour.registerTarget(stepId, ref);
    return cleanup;
  }, [tour.isActive, stepId, ref, tour.registerTarget]);
}
