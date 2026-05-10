import { motion, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';

const ORB_COLOR = '#e9c349';
const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Section 1 — Hook. A two-line statement and a softly pulsing orb.
 * The headline enters with a 1.2s blur-fade so the manifiesto opens
 * cinematically right after the loading screen hands off; the orb's
 * pulse loop kicks in after a 0.6s stagger.
 */
export default function Section1Hook() {
  const reduced = useReducedMotion();
  return (
    <InicioSection className="min-h-[80vh] flex flex-col items-center justify-center text-center">
      <motion.h1
        initial={{
          opacity: 0,
          y: reduced ? 0 : 30,
          filter: reduced ? 'blur(0px)' : 'blur(10px)',
        }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: reduced ? 0.4 : 1.2, ease, delay: 0.1 }}
        className="font-display italic tracking-tight text-amber-100/90 text-5xl md:text-7xl leading-tight mb-12"
      >
        El viaje hacia el universo
        <br />
        empieza adentro.
      </motion.h1>
      <motion.div
        initial={{ opacity: 0 }}
        animate={
          reduced
            ? { opacity: 1 }
            : { scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }
        }
        transition={{
          duration: 4,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatType: 'mirror',
          delay: 0.6,
        }}
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
