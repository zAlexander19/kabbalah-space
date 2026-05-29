import { apiFetch } from '../auth';

interface RespuestaResponse {
  id: string;
  pregunta_id: string;
  respuesta_texto: string;
  fecha_registro: string;
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
