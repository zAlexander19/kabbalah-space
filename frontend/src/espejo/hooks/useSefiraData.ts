import { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '../../shared/tokens';
import type { PreguntaConEstado, Registro } from '../types';

export function useSefiraData(sefiraId: string | null) {
  const [preguntas, setPreguntas] = useState<PreguntaConEstado[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!sefiraId) {
      setPreguntas([]);
      setRegistros([]);
      return;
    }
    setLoading(true);
    try {
      const [pRes, rRes] = await Promise.all([
        fetch(`${API_BASE}/respuestas/${sefiraId}`),
        fetch(`${API_BASE}/registros/${sefiraId}`),
      ]);
      if (pRes.ok) setPreguntas(await pRes.json());
      if (rRes.ok) setRegistros(await rRes.json());
    } finally {
      setLoading(false);
    }
  }, [sefiraId]);

  useEffect(() => { void reload(); }, [reload]);

  return { preguntas, registros, loading, reload };
}
