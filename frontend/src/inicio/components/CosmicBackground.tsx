import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';

type Star = {
  top: string;
  left: string;
  size: number;
  duration: number;
  delay: number;
};

const STAR_COUNT = 80;

/**
 * Three-layer cosmic background for the manifiesto:
 *   1. Radial gradient base (subtle, almost-black).
 *   2. 80 single-pixel stars at stable positions that flicker on a 3-8s loop.
 *   3. Two large blurred colour patches (amber + indigo) with mix-blend-screen.
 *
 * Renders behind the page content with `fixed inset-0 -z-10 pointer-events-none`.
 * Respects `prefers-reduced-motion`: stars stop flickering, gradient stops pulsing.
 */
export default function CosmicBackground() {
  const reduced = useReducedMotion();

  const stars: Star[] = useMemo(() => {
    return Array.from({ length: STAR_COUNT }, () => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() < 0.75 ? 1 : 2,
      duration: 3 + Math.random() * 5, // 3–8s
      delay: Math.random() * 5,         // 0–5s
    }));
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
    >
      {/* Layer 1 — radial gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, #0e1014 0%, #070709 60%, #000000 100%)',
        }}
      />

      {/* Layer 2 — stars */}
      <div className="absolute inset-0">
        {stars.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              top: s.top,
              left: s.left,
              width: `${s.size}px`,
              height: `${s.size}px`,
              opacity: 0.6,
              animation: reduced
                ? undefined
                : `flicker ${s.duration}s ease-in-out ${s.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Layer 3 — blurred colour patches */}
      <div
        className="absolute"
        style={{
          bottom: '-15%',
          left: '-10%',
          width: '600px',
          height: '600px',
          background: 'rgba(217, 119, 6, 0.15)',
          filter: 'blur(140px)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="absolute"
        style={{
          top: '-10%',
          right: '-5%',
          width: '500px',
          height: '500px',
          background: 'rgba(67, 56, 202, 0.12)',
          filter: 'blur(120px)',
          mixBlendMode: 'screen',
        }}
      />
    </div>
  );
}
