export type MesBucket = {
  mes: string;
  score_usuario: number | null;
  score_ia: number | null;
  reflexiones: number;
  respuestas: number;
};

export type SefiraEvolucion = {
  sefira_id: string;
  sefira_nombre: string;
  meses: MesBucket[];
};

export type Metrics = {
  usuario: boolean;
  ia: boolean;
};

export type RangeOption = 3 | 6 | 12 | 'todo';

export const RANGE_TO_MESES: Record<RangeOption, number> = {
  3: 3,
  6: 6,
  12: 12,
  todo: 120,
};
