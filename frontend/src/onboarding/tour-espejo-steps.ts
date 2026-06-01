// frontend/src/onboarding/tour-espejo-steps.ts

export type StepId = 1 | 2 | 3;

export type StepPlacement = 'top' | 'bottom' | 'left' | 'right';

export type StepMode = 'linear' | 'contextual';

export type StepAdvanceOn = 'target-click' | 'target-focus' | 'next-button';

export interface TourStep {
  id: StepId;
  targetId: string;
  copy: string;
  placement: StepPlacement;
  mode: StepMode;
  advanceOn: StepAdvanceOn;
  autoCloseAfterMs?: number;
}

// MVP scope: 3 pasos que el usuario nuevo puede completar antes de guardar
// su primera reflexión. Pasos sobre ReflectionEditor (en AnswersGridModal,
// post-save) y HistoryList (requiere >1 registros) quedan para una iteración
// futura cuando esos componentes vivan en la UI pre-save.
export const STEPS: readonly TourStep[] = [
  {
    id: 1,
    targetId: 'espejo-tree-root',
    copy: 'Este es tu Árbol de la Vida. 10 dimensiones del alma.',
    placement: 'right',
    mode: 'linear',
    advanceOn: 'next-button',
  },
  {
    id: 2,
    targetId: 'espejo-sefira-tiferet',
    copy: 'Haz click en cualquier sefirá para entrar.',
    placement: 'right',
    mode: 'linear',
    advanceOn: 'target-click',
  },
  {
    id: 3,
    targetId: 'espejo-pregunta-textarea',
    copy: 'Responde desde lo que estás viviendo. Cuando termines, guarda tus respuestas con el botón abajo.',
    placement: 'bottom',
    mode: 'linear',
    advanceOn: 'next-button',
  },
] as const;

export const TOUR_DONE_FLAG = 'tour_espejo_done';
