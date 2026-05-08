import { useEffect, useState, useCallback } from 'react';
import { apiFetch, useAuth } from '../../auth';
import type { PreguntaConEstado, Registro } from '../types';

type RawPregunta = { id: string; texto_pregunta: string; sefira_id: string };

/**
 * Loads the question list + registros for a sefirá. Branches on auth:
 *
 * - Authenticated: fetch `/respuestas/{id}` (per-user cooldown state) and
 *   `/registros/{id}` (per-user reflection history).
 * - Anonymous: fetch the public `/preguntas/{id}` and synthesize
 *   `PreguntaConEstado` rows with everything unblocked. No registros (anon
 *   users have none).
 *
 * This lets anonymous users open the carousel and start writing answers
 * before logging in — the gated-save flow handles the rest.
 */
export function useSefiraData(sefiraId: string | null) {
  const { status } = useAuth();
  const [preguntas, setPreguntas] = useState<PreguntaConEstado[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!sefiraId || status === 'loading') {
      setPreguntas([]);
      setRegistros([]);
      return;
    }
    setLoading(true);
    try {
      if (status === 'authenticated') {
        const [pRes, rRes] = await Promise.all([
          apiFetch(`/respuestas/${sefiraId}`),
          apiFetch(`/registros/${sefiraId}`),
        ]);
        if (pRes.ok) setPreguntas(await pRes.json());
        if (rRes.ok) setRegistros(await rRes.json());
      } else {
        const res = await apiFetch(`/preguntas/${sefiraId}`);
        if (res.ok) {
          const raw: RawPregunta[] = await res.json();
          const synth: PreguntaConEstado[] = raw.map((p) => ({
            pregunta_id: p.id,
            texto_pregunta: p.texto_pregunta,
            ultima_respuesta: null,
            fecha_ultima: null,
            siguiente_disponible: null,
            bloqueada: false,
            dias_restantes: null,
          }));
          setPreguntas(synth);
        }
        setRegistros([]);
      }
    } finally {
      setLoading(false);
    }
  }, [sefiraId, status]);

  useEffect(() => { void reload(); }, [reload]);

  return { preguntas, registros, loading, reload };
}
