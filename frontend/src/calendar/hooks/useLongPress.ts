import { useCallback, useRef } from 'react';

interface LongPressOptions {
  /** Cuántos ms hay que mantener apretado antes de disparar onLongPress. Default 500ms. */
  delay?: number;
  /** Si true, mover el dedo más de `moveThreshold` antes de los `delay` ms cancela el long-press. Default true. */
  cancelOnMove?: boolean;
  /** Distancia en px antes de cancelar (si cancelOnMove=true). Default 10. */
  moveThreshold?: number;
}

interface LongPressHandlers<T extends HTMLElement> {
  onPointerDown: (e: React.PointerEvent<T>) => void;
  onPointerUp: (e: React.PointerEvent<T>) => void;
  onPointerLeave: (e: React.PointerEvent<T>) => void;
  onPointerMove: (e: React.PointerEvent<T>) => void;
  onPointerCancel: (e: React.PointerEvent<T>) => void;
}

/**
 * Long-press hook que cancela si el dedo se mueve antes del delay.
 * Dispara haptic feedback (40ms vibration) al activar, si el browser lo soporta.
 *
 * Uso:
 *   const handlers = useLongPress(() => console.log('held!'));
 *   return <div {...handlers}>Hold me</div>;
 */
export function useLongPress<T extends HTMLElement>(
  onLongPress: (e: React.PointerEvent<T>) => void,
  options: LongPressOptions = {},
): LongPressHandlers<T> {
  const { delay = 500, cancelOnMove = true, moveThreshold = 10 } = options;
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
    triggeredRef.current = false;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<T>) => {
      startRef.current = { x: e.clientX, y: e.clientY };
      triggeredRef.current = false;
      timerRef.current = window.setTimeout(() => {
        triggeredRef.current = true;
        if (typeof navigator.vibrate === 'function') {
          navigator.vibrate(40);
        }
        onLongPress(e);
      }, delay);
    },
    [delay, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      if (!cancelOnMove || !startRef.current || triggeredRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) > moveThreshold) clear();
    },
    [cancelOnMove, moveThreshold, clear],
  );

  return {
    onPointerDown,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerMove,
    onPointerCancel: clear,
  };
}
