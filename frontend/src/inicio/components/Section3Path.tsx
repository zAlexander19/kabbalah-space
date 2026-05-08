import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';

const ease = [0.16, 1, 0.3, 1] as const;
const DOT_R = 4;
const DOTS: { cx: number; cy: number }[] = [
  { cx: 30, cy: 28 },
  { cx: 100, cy: 12 },
  { cx: 170, cy: 28 },
];

/**
 * Section 3 — El camino. Carries the "particular" beat: in every
 * generation, a few individuals already live the knowledge as eyesight,
 * not rumor. Anchored by the rabbinical line about Abraham and Jacob.
 *
 * The constellation: three dots fade in staggered, then two connecting
 * lines draw between them.
 */
export default function Section3Path() {
  const ref = useRef<SVGSVGElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -20% 0px' });
  const reduced = useReducedMotion();

  return (
    <InicioSection className="text-center">
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-2">
        Pero ese día no nace de la multitud.
      </p>
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-8">
        Cada generación lleva sus despiertos —
        <br />
        pocos, suficientes — que ya viven
        <br />
        el conocimiento como ojo, no como rumor.
      </p>

      <svg
        ref={ref}
        viewBox="0 0 200 40"
        className="block mx-auto w-40 md:w-52 mb-8"
        aria-hidden
      >
        {/* Connecting lines drawn after the dots appear. */}
        <motion.line
          x1={DOTS[0].cx} y1={DOTS[0].cy}
          x2={DOTS[1].cx} y2={DOTS[1].cy}
          stroke="rgba(253,230,138,0.45)" strokeWidth={1} strokeLinecap="round"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: inView ? 1 : reduced ? 1 : 0 }}
          transition={{ duration: 0.9, ease, delay: reduced ? 0 : 0.9 }}
        />
        <motion.line
          x1={DOTS[1].cx} y1={DOTS[1].cy}
          x2={DOTS[2].cx} y2={DOTS[2].cy}
          stroke="rgba(253,230,138,0.45)" strokeWidth={1} strokeLinecap="round"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: inView ? 1 : reduced ? 1 : 0 }}
          transition={{ duration: 0.9, ease, delay: reduced ? 0 : 1.3 }}
        />
        {/* Three luminous dots. */}
        {DOTS.map((d, i) => (
          <motion.circle
            key={i}
            cx={d.cx} cy={d.cy} r={DOT_R}
            fill="rgba(253,230,138,0.95)"
            initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.4 }}
            animate={{
              opacity: inView ? 1 : reduced ? 1 : 0,
              scale: inView ? 1 : reduced ? 1 : 0.4,
            }}
            transition={{ duration: 0.5, ease, delay: reduced ? 0 : i * 0.3 }}
            style={{ filter: `drop-shadow(0 0 4px rgba(253,230,138,0.8))` }}
          />
        ))}
      </svg>

      <blockquote className="font-serif italic text-base text-stone-400 leading-relaxed">
        "No hay generación en la cual
        <br />
        no haya alguien como Abraham y Jacob."
        <footer className="mt-2 not-italic text-[11px] uppercase tracking-[0.18em] text-stone-500">
          Sabios de la tradición
        </footer>
      </blockquote>
    </InicioSection>
  );
}
