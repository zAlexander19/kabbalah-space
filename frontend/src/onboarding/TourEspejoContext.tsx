// frontend/src/onboarding/TourEspejoContext.tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import { STEPS, TOUR_DONE_FLAG, type StepId } from './tour-espejo-steps';

interface TourEspejoContextValue {
  isActive: boolean;
  currentStep: StepId | null;
  start: () => void;
  next: () => void;
  /** Cierra el tour y lo marca como hecho — el usuario no lo vuelve a ver. */
  skip: () => void;
  /** Cierra el tour SIN marcarlo como hecho — la próxima visita lo vuelve a
   *  mostrar. Lo usa el cleanup del EspejoModule cuando el usuario navega fuera
   *  por accidente (ej. click en el logo), para no penalizar misclicks con la
   *  pérdida permanente del onboarding. */
  cancel: () => void;
  registerTarget: (stepId: StepId, ref: RefObject<HTMLElement>) => () => void;
  getTargetRef: (stepId: StepId) => RefObject<HTMLElement> | null;
}

const TourEspejoContext = createContext<TourEspejoContextValue | null>(null);

function isDone(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_FLAG) === '1';
  } catch {
    return false;
  }
}

function markDone() {
  try {
    localStorage.setItem(TOUR_DONE_FLAG, '1');
  } catch {
    /* localStorage may be unavailable (private mode) — silently noop */
  }
}

export function TourEspejoProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepId | null>(null);

  // Stored in a ref + version counter so re-renders only happen when consumers
  // actually need them (mounting/unmounting a step target).
  const targetsRef = useRef<Map<StepId, RefObject<HTMLElement>>>(new Map());
  const [targetsVersion, setTargetsVersion] = useState(0);

  const start = useCallback(() => {
    if (isDone()) return;
    setCurrentStep(1);
    setIsActive(true);
  }, []);

  const finish = useCallback(() => {
    markDone();
    setIsActive(false);
    setCurrentStep(null);
  }, []);

  const next = useCallback(() => {
    if (currentStep === null) return;
    const nextId = (currentStep + 1) as StepId;
    if (nextId > STEPS.length) {
      finish();
      return;
    }
    setCurrentStep(nextId);
  }, [currentStep, finish]);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const cancel = useCallback(() => {
    setIsActive(false);
    setCurrentStep(null);
  }, []);

  const registerTarget = useCallback(
    (stepId: StepId, ref: RefObject<HTMLElement>) => {
      targetsRef.current.set(stepId, ref);
      setTargetsVersion((v) => v + 1);
      return () => {
        const current = targetsRef.current.get(stepId);
        if (current === ref) {
          targetsRef.current.delete(stepId);
          setTargetsVersion((v) => v + 1);
        }
      };
    },
    [],
  );

  const getTargetRef = useCallback(
    (stepId: StepId): RefObject<HTMLElement> | null => {
      return targetsRef.current.get(stepId) ?? null;
    },
    // targetsVersion is intentionally in deps so consumers re-read after register/unregister.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetsVersion],
  );

  const value = useMemo<TourEspejoContextValue>(
    () => ({
      isActive,
      currentStep,
      start,
      next,
      skip,
      cancel,
      registerTarget,
      getTargetRef,
    }),
    [isActive, currentStep, start, next, skip, cancel, registerTarget, getTargetRef],
  );

  return <TourEspejoContext.Provider value={value}>{children}</TourEspejoContext.Provider>;
}

export function useTourEspejo(): TourEspejoContextValue {
  const ctx = useContext(TourEspejoContext);
  if (ctx === null) {
    throw new Error('useTourEspejo must be used inside <TourEspejoProvider>');
  }
  return ctx;
}
