import { useEffect, useMemo, useRef, useState } from 'react';
import type { SefiraResumen } from '../types';

const PHASE_DURATION = 5300;

export function useReflectionRotation(items: SefiraResumen[], active: boolean) {
  const sorted = useMemo(() => {
    const withReflection = items.filter(s => s.score_ia_promedio !== null && s.ultima_reflexion_texto);
    const empty = items.filter(s => !(s.score_ia_promedio !== null && s.ultima_reflexion_texto));

    withReflection.sort((a, b) => {
      const sa = a.score_ia_promedio ?? 0;
      const sb = b.score_ia_promedio ?? 0;
      if (sb !== sa) return sb - sa;
      const ta = a.ultima_actividad ? new Date(a.ultima_actividad).getTime() : 0;
      const tb = b.ultima_actividad ? new Date(b.ultima_actividad).getTime() : 0;
      return tb - ta;
    });

    return [...withReflection, ...empty];
  }, [items]);

  const [index, setIndex] = useState(0);
  const hoveredRef = useRef(false);
  const visibilityRef = useRef(typeof document !== 'undefined' ? !document.hidden : true);

  useEffect(() => {
    if (!active || sorted.length === 0) return;
    const id = window.setInterval(() => {
      if (hoveredRef.current || !visibilityRef.current) return;
      setIndex(i => (i + 1) % sorted.length);
    }, PHASE_DURATION);
    return () => window.clearInterval(id);
  }, [active, sorted.length]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => { visibilityRef.current = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (index >= sorted.length) setIndex(0);
  }, [sorted.length, index]);

  const current = active && sorted.length > 0 ? sorted[index % sorted.length] : null;

  function setHovered(h: boolean) {
    hoveredRef.current = h;
  }

  return { current, setHovered, total: sorted.length };
}
