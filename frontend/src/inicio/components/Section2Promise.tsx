import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Section 2 — La promesa. Carries the "general" beat: the eventual
 * collective awakening of humanity. Anchored by an Isaiah verse rendered
 * verbatim. The decorative line draws left→right when the section enters
 * the viewport.
 */
export default function Section2Promise() {
  const lineRef = useRef<SVGSVGElement | null>(null);
  const lineInView = useInView(lineRef, { once: true, margin: '0px 0px -20% 0px' });
  const reduced = useReducedMotion();

  return (
    <InicioSection className="text-center">
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-8">
        Llegará un día en que la humanidad entera
        <br />
        conocerá el misterio en el que vive.
      </p>

      <svg
        ref={lineRef}
        viewBox="0 0 200 2"
        className="block mx-auto w-32 md:w-40 h-[2px] mb-8"
        aria-hidden
      >
        <motion.line
          x1={0}
          y1={1}
          x2={200}
          y2={1}
          stroke="rgba(253,230,138,0.6)"
          strokeWidth={2}
          strokeLinecap="round"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: lineInView ? 1 : reduced ? 1 : 0 }}
          transition={{ duration: 1.2, ease }}
        />
      </svg>

      <blockquote className="font-serif italic text-base text-stone-400 leading-relaxed">
        "Porque la tierra será llena del conocimiento del Señor,
        <br />
        como las aguas cubren el mar."
        <footer className="mt-2 not-italic text-[11px] uppercase tracking-[0.18em] text-stone-500">
          Isaías 11.9
        </footer>
      </blockquote>
    </InicioSection>
  );
}
