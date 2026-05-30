// frontend/src/onboarding/tour-espejo-steps.ts

export type StepId = 1 | 2 | 3 | 4 | 5;

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
    copy: 'Hacé click en cualquier sefirá para entrar.',
    placement: 'right',
    mode: 'linear',
    advanceOn: 'target-click',
  },
  {
    id: 3,
    targetId: 'espejo-pregunta-textarea',
    copy: 'Respondé desde lo que estás viviendo.',
    placement: 'bottom',
    mode: 'contextual',
    advanceOn: 'target-focus',
  },
  {
    id: 4,
    targetId: 'espejo-reflection-editor',
    copy: 'Acá escribís tu reflexión libre y nivelás la energía.',
    placement: 'left',
    mode: 'contextual',
    advanceOn: 'target-click',
  },
  {
    id: 5,
    targetId: 'espejo-history-list',
    copy: 'Acá vas a ver todas tus reflexiones pasadas. Click en cualquiera para revisitarla.',
    placement: 'top',
    mode: 'contextual',
    advanceOn: 'target-click',
    autoCloseAfterMs: 30000,
  },
] as const;

export const TOUR_DONE_FLAG = 'tour_espejo_done';
