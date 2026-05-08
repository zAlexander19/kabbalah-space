import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';

const ORB_COLOR = '#e9c349';
const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Section 4 — El puente. The thesis statement of the manifiesto:
 * knowledge of the universe begins with self-knowledge. Decorative
 * orb expands (scale 0.4 → 1.2) when the section enters the viewport
 * to suggest "opening".
 */
export default function Section4Bridge() {
  const orbRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(orbRef, { once: true, margin: '0px 0px -20% 0px' });
  const reduced = useReducedMotion();

  return (
    <InicioSection className="text-center">
      <h2 className="font-serif font-light tracking-tight text-amber-100/90 text-3xl md:text-5xl leading-tight mb-10">
        Conocer el universo empieza
        <br />
        por conocerte a vos mismo.
      </h2>
      <p className="font-serif italic text-lg md:text-xl text-stone-300/85 leading-relaxed mb-12">
        Cada dimensión del alma
        <br />
        es un pliegue del cosmos.
      </p>

      <motion.div
        ref={orbRef}
        initial={{ scale: reduced ? 1 : 0.4, opacity: reduced ? 1 : 0 }}
        animate={inView ? { scale: 1.2, opacity: 1 } : { scale: reduced ? 1 : 0.4, opacity: reduced ? 1 : 0 }}
        transition={{ duration: 1.5, ease }}
        className="w-20 h-20 mx-auto rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${ORB_COLOR}ff 0%, ${ORB_COLOR}aa 60%, ${ORB_COLOR}55 100%)`,
          border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: `inset -8px -8px 16px rgba(0,0,0,0.6), inset 8px 8px 16px rgba(255,255,255,0.3), 0 0 32px ${ORB_COLOR}aa, 0 0 64px ${ORB_COLOR}55`,
        }}
        aria-hidden
      />
    </InicioSection>
  );
}
