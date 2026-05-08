import { motion, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';

const ORB_COLOR = '#e9c349';

/**
 * Section 1 — Hook. A two-line statement and a softly pulsing orb.
 * The orb reuses the radial-gradient + glow pattern from the Tree of Life
 * orbs so the visual language is continuous with what comes later.
 */
export default function Section1Hook() {
  const reduced = useReducedMotion();
  return (
    <InicioSection className="min-h-[80vh] flex flex-col items-center justify-center text-center">
      <h1 className="font-serif font-light tracking-tight text-amber-100/90 text-5xl md:text-7xl leading-tight mb-12">
        El viaje hacia el universo
        <br />
        empieza adentro.
      </h1>
      <motion.div
        animate={reduced ? { opacity: 1 } : { scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' }}
        className="w-16 h-16 rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${ORB_COLOR}ff 0%, ${ORB_COLOR}aa 60%, ${ORB_COLOR}55 100%)`,
          border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: `inset -8px -8px 16px rgba(0,0,0,0.6), inset 8px 8px 16px rgba(255,255,255,0.3), 0 0 24px ${ORB_COLOR}aa, 0 0 48px ${ORB_COLOR}55`,
        }}
        aria-hidden
      />
    </InicioSection>
  );
}
