import { useState, useCallback } from 'react';
import { apiFetch } from '../../auth';

export type Felicitacion = {
  sefira_id: string;
  sefira_nombre: string;
  count: number;
  message: string;
};

/**
 * Tras crear una actividad, llama POST /ia/calendario/felicitacion.
 * Si el backend dice {show:true}, expone la felicitacion para que un
 * <FelicitacionToast> la muestre. Auto-clear después de 4 segundos.
 */
export function useFelicitacion() {
  const [felicitacion, setFelicitacion] = useState<Felicitacion | null>(null);

  const trigger = useCallback(async (actividadId: string) => {
    try {
      const res = await apiFetch('/ia/calendario/felicitacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actividad_id: actividadId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.show) {
        setFelicitacion({
          sefira_id: data.sefira_id,
          sefira_nombre: data.sefira_nombre,
          count: data.count,
          message: data.message,
        });
        window.setTimeout(() => setFelicitacion(null), 4000);
      }
    } catch {
      // Silencioso: la felicitación es accesorio
    }
  }, []);

  function dismiss() { setFelicitacion(null); }

  return { felicitacion, trigger, dismiss };
}
