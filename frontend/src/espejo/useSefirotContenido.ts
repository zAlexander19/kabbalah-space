import { useEffect, useState } from 'react';
import { apiFetch } from '../auth';
import type { SefiraContenido } from './sefirotContent';

type ApiItem = {
  id: string;
  esencia: string | null;
  palabras_clave: string[];
  que_observa: string | null;
};

// Fetch único a nivel módulo (singleton). La card se monta muchas veces; esto
// asegura una sola llamada por sesión.
let cache: Record<string, SefiraContenido> | null = null;
let inflight: Promise<Record<string, SefiraContenido>> | null = null;

async function fetchContenido(): Promise<Record<string, SefiraContenido>> {
  const res = await apiFetch('/sefirot/contenido');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: ApiItem[] = await res.json();
  const map: Record<string, SefiraContenido> = {};
  for (const it of data) {
    map[it.id] = {
      esencia: it.esencia ?? '',
      palabrasClave: it.palabras_clave ?? [],
      queObserva: it.que_observa ?? '',
    };
  }
  return map;
}

/** Contenido de sefirot desde la API, cacheado por sesión. `{}` hasta que carga.
 *  La card cae a SEFIROT_CONTENIDO estático mientras tanto / si falla. */
export function useSefirotContenido(): Record<string, SefiraContenido> {
  const [map, setMap] = useState<Record<string, SefiraContenido>>(cache ?? {});

  useEffect(() => {
    if (cache) { setMap(cache); return; }
    if (!inflight) {
      inflight = fetchContenido()
        .then((m) => { cache = m; return m; })
        .catch(() => ({} as Record<string, SefiraContenido>))
        .finally(() => { inflight = null; });
    }
    let active = true;
    inflight.then((m) => { if (active) setMap(m); });
    return () => { active = false; };
  }, []);

  return map;
}
