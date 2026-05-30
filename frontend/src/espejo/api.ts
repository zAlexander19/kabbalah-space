import { apiFetch } from '../auth';
import type { Registro } from './types';

interface RespuestaResponse {
  id: string;
  pregunta_id: string;
  respuesta_texto: string;
  fecha_registro: string;
}

export interface HistorialRespuestaSnapshot {
  pregunta_id: string;
  texto_pregunta: string;
  respuesta_texto: string;
  fecha_respuesta: string;
}

export interface HistorialSnapshot {
  registro: Registro;
  sefira_id: string;
  sefira_nombre: string;
  respuestas: HistorialRespuestaSnapshot[];
}

export async function getHistorialSnapshot(registroId: string): Promise<HistorialSnapshot> {
  const res = await apiFetch(`/espejo/registros/${registroId}/snapshot`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === 'string') return body.detail;
    if (body.detail && typeof body.detail.reason === 'string') return body.detail.reason;
  } catch {
    /* fall through */
  }
  return `HTTP ${res.status}`;
}

/**
 * Premium-only: crea una nueva respuesta a la pregunta, ignorando el cooldown.
 * Las respuestas anteriores quedan intactas como histórico.
 */
export async function forzarRespuesta(
  preguntaId: string,
  respuestaTexto: string,
): Promise<RespuestaResponse> {
  const res = await apiFetch(`/respuestas/${preguntaId}/forzar`, {
    method: 'POST',
    body: JSON.stringify({ respuesta_texto: respuestaTexto }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/**
 * Premium-only: duplica la última respuesta del usuario para esa pregunta,
 * creando una entrada con fecha actual y mismo texto. Útil para mantener
 * la respuesta anterior pero registrar un nuevo ciclo de reflexión.
 */
export async function duplicarRespuesta(preguntaId: string): Promise<RespuestaResponse> {
  const res = await apiFetch(`/respuestas/${preguntaId}/duplicar`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
