import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

export default function InicioPremisa() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();
  const y = reduced ? 0 : 28;
  return (
    <motion.section
      ref={ref}
      id="premisa"
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className="relative py-32 md:py-48 px-6"
    >
      <div className="max-w-2xl mx-auto text-center">
        <p className="ks-eyebrow text-gold mb-6">Premisa</p>
        <h2 className="ks-serif italic text-4xl md:text-6xl text-ink-glow font-light leading-[1.1] mb-10">
          El conocimiento del universo empieza por adentro.
        </h2>
        <p className="ks-body text-lg mb-6">
          Llegará un día en que la humanidad entera conocerá el misterio en el que vive. Pero ese día no nace de la multitud — nace en cada persona que decide mirar adentro.
        </p>
        <blockquote className="ks-serif italic text-xl md:text-2xl text-ink-glow/90 leading-relaxed border-l-2 border-gold/40 pl-6 mt-10 mx-auto max-w-xl text-left">
          “Porque la tierra será llena del conocimiento del Señor, como las aguas cubren el mar.”
          <footer className="ks-eyebrow text-gold mt-3 not-italic">— Isaías 11:9</footer>
        </blockquote>
      </div>
    </motion.section>
  );
}
