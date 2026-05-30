import { useEffect, useState, useCallback, useRef } from 'react';
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
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    if (!sefiraId || status === 'loading') {
      setPreguntas([]);
      setRegistros([]);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      if (status === 'authenticated') {
        const [pRes, rRes] = await Promise.all([
          apiFetch(`/respuestas/${sefiraId}`, { signal: controller.signal }),
          apiFetch(`/registros/${sefiraId}`, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        if (pRes.ok) setPreguntas(await pRes.json());
        if (controller.signal.aborted) return;
        if (rRes.ok) setRegistros(await rRes.json());
      } else {
        const res = await apiFetch(`/preguntas/${sefiraId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
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
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      throw e;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [sefiraId, status]);

  useEffect(() => {
    void reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  return { preguntas, registros, loading, reload };
}
