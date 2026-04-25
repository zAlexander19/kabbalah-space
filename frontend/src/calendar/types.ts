export type SefiraNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  colorClass: string;
  textClass: string;
  description?: string;
};

export type ActivitySefira = {
  id: string;
  nombre: string;
};

export type Activity = {
  id: string;
  titulo: string;
  descripcion: string | null;
  inicio: string;
  fin: string;
  estado: string;
  sefirot: ActivitySefira[];
};

export type VolumeItem = {
  sefira_id: string;
  sefira_nombre: string;
  horas_total: number;
  actividades_total: number;
};

export type CalendarView = 'semana' | 'mes' | 'anio';

export type DateRange = { start: Date; end: Date };
