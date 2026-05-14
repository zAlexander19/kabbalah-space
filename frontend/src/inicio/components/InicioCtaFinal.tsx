import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

type Props = {
  onEnterEspejo: () => void;
};

export default function InicioCtaFinal({ onEnterEspejo }: Props) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();
  const y = reduced ? 0 : 28;
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className="py-32 md:py-48 px-6"
    >
      <div className="max-w-2xl mx-auto text-center">
        <p className="ks-eyebrow text-gold mb-6">Comenzá</p>
        <h2 className="ks-serif italic text-4xl md:text-6xl text-ink-glow font-light leading-[1.1] mb-12">
          Tu árbol te espera.
        </h2>
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <button type="button" onClick={onEnterEspejo} className="ks-btn-primary">
            Entrar al Árbol →
          </button>
          <a href="#premisa" className="ks-btn-ghost">
            Cómo funciona ↓
          </a>
        </div>
      </div>
    </motion.section>
  );
}
