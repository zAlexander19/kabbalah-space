export type SefiraResumen = {
  sefira_id: string;
  sefira_nombre: string;
  preguntas_total: number;
  preguntas_frescas: number;
  preguntas_disponibles: number;
  score_ia_promedio: number | null;
  score_ia_ultimos: number[];
  ultima_reflexion_texto: string | null;
  ultima_reflexion_score: number | null;
  ultima_actividad: string | null;
  intensidad: number;
};

export type PreguntaConEstado = {
  pregunta_id: string;
  texto_pregunta: string;
  ultima_respuesta: string | null;
  fecha_ultima: string | null;
  siguiente_disponible: string | null;
  bloqueada: boolean;
  dias_restantes: number | null;
};

export type Registro = {
  id: string;
  reflexion_texto: string;
  puntuacion_usuario: number | null;
  puntuacion_ia: number | null;
  fecha_registro: string;
};
