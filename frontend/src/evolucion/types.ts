export type MesBucket = {
  mes: string;
  score_usuario: number | null;
  score_ia: number | null;
  reflexiones: number;
  respuestas: number;
  actividades: number;
};

export type SefiraEvolucion = {
  sefira_id: string;
  sefira_nombre: string;
  meses: MesBucket[];
};

export type Metrics = {
  usuario: boolean;
  ia: boolean;
  actividades: boolean;
};

export type RangeOption = 'mes' | 3 | 6 | 12;

// "mes" is the weekly drill-down (handled by useEvolucionMes, not by the
// monthly /espejo/evolucion endpoint), so it has no entry here.
export const RANGE_TO_MESES: Record<Exclude<RangeOption, 'mes'>, number> = {
  3: 3,
  6: 6,
  12: 12,
};

export type SemanaBucket = {
  semana: number;
  label: string;
  desde: string;       // ISO date
  hasta: string;       // ISO date
  actividades: number;
};

export type SefiraSemanas = {
  sefira_id: string;
  sefira_nombre: string;
  mes: string;
  score_usuario: number | null;
  score_ia: number | null;
  reflexiones: number;
  respuestas: number;
  actividades: number;
  semanas: SemanaBucket[];
};
