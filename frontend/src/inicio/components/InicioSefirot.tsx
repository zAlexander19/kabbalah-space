import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { SEFIRA_COLORS } from '../../shared/tokens';

type SefiraInfo = { id: string; name: string; meaning: string };

const SEFIROT_INFO: SefiraInfo[] = [
  { id: 'keter',   name: 'Kéter',    meaning: 'La voluntad primigenia.' },
  { id: 'jojma',   name: 'Jojmá',    meaning: 'El destello inicial de inspiración.' },
  { id: 'bina',    name: 'Biná',     meaning: 'El entendimiento que da estructura.' },
  { id: 'jesed',   name: 'Jésed',    meaning: 'La misericordia y el amor expansivo.' },
  { id: 'gevura',  name: 'Gueburá',  meaning: 'El rigor y el juicio que contiene.' },
  { id: 'tiferet', name: 'Tiféret',  meaning: 'La belleza, el equilibrio del corazón.' },
  { id: 'netzaj',  name: 'Nétsaj',   meaning: 'La perseverancia, la victoria sostenida.' },
  { id: 'hod',     name: 'Hod',      meaning: 'El esplendor de la inteligencia práctica.' },
  { id: 'yesod',   name: 'Yesod',    meaning: 'El fundamento, la imaginación motriz.' },
  { id: 'maljut',  name: 'Maljut',   meaning: 'El reino, la acción en el mundo.' },
];

export default function InicioSefirot() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();
  const y = reduced ? 0 : 28;

  return (
    <motion.section
      ref={ref}
      id="sefirot"
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className="py-24 md:py-32 px-6"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="ks-eyebrow text-gold mb-4">El árbol</p>
          <h2 className="ks-serif text-4xl md:text-5xl text-ink-glow font-light leading-[1.1]">
            Diez dimensiones del alma.
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {SEFIROT_INFO.map((s) => (
            <article key={s.id} className="ks-sef-card">
              <div className="flex items-center gap-2 mb-2">
                <span
                  aria-hidden
                  className="block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: SEFIRA_COLORS[s.id], boxShadow: `0 0 6px ${SEFIRA_COLORS[s.id]}55` }}
                />
                <h3 className="ks-serif text-lg text-ink-glow font-light">{s.name}</h3>
              </div>
              <p className="ks-body text-sm leading-relaxed">{s.meaning}</p>
            </article>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
