import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

type CardData = {
  art: React.ReactNode;
  title: string;
  body: string;
};

function ModuleCard({ art, title, body }: CardData) {
  return (
    <article className="ks-module-card p-7 flex flex-col">
      <div className="h-20">{art}</div>
      <h3 className="ks-serif italic text-gold text-2xl mb-3 mt-6">{title}</h3>
      <p className="ks-body text-sm mb-8 flex-1">{body}</p>
      <span className="ks-eyebrow text-gold mt-auto inline-block">EXPLORAR →</span>
    </article>
  );
}

const EspejoArt = (
  <svg viewBox="0 0 200 80" className="w-full h-20" aria-hidden="true">
    <line x1="100" y1="40" x2="60" y2="40" stroke="#e9c349" strokeOpacity="0.25" strokeWidth="0.75" />
    <line x1="100" y1="40" x2="140" y2="40" stroke="#e9c349" strokeOpacity="0.25" strokeWidth="0.75" />
    <line x1="100" y1="40" x2="100" y2="12" stroke="#e9c349" strokeOpacity="0.25" strokeWidth="0.75" />
    <circle cx="100" cy="40" r="22" stroke="#e9c349" strokeOpacity="0.35" strokeWidth="1" fill="none" />
    <circle cx="100" cy="40" r="12" fill="#e9c349" fillOpacity="0.9" />
    <circle cx="60" cy="40" r="2.5" fill="#e9c349" fillOpacity="0.7" />
    <circle cx="140" cy="40" r="2.5" fill="#e9c349" fillOpacity="0.7" />
    <circle cx="100" cy="12" r="2.5" fill="#e9c349" fillOpacity="0.7" />
  </svg>
);

const CalendarioArt = (
  <svg viewBox="0 0 200 80" className="w-full h-20" aria-hidden="true">
    {Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 7 }, (_, col) => {
        const isHighlight = col === 4 && row === 2;
        return (
          <rect
            key={`${row}-${col}`}
            x={16 + col * 24}
            y={4 + row * 18}
            width="20"
            height="14"
            rx="2"
            fill={isHighlight ? '#e9c349' : '#181818'}
            fillOpacity={isHighlight ? 0.85 : 1}
            stroke={isHighlight ? 'none' : '#3a3a3a'}
            strokeWidth={isHighlight ? 0 : 0.5}
          />
        );
      })
    )}
  </svg>
);

const EvolucionArt = (
  <svg viewBox="0 0 200 80" className="w-full h-20" aria-hidden="true">
    <defs>
      <linearGradient id="evoGrad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#e9c349" />
        <stop offset="100%" stopColor="#e9c349" stopOpacity="0" />
      </linearGradient>
    </defs>
    <line x1="10" y1="68" x2="190" y2="68" stroke="rgba(120,113,90,0.3)" strokeWidth="0.5" />
    <path
      d="M10 65 C 50 60, 80 40, 110 30 S 170 12, 190 8 L 190 68 L 10 68 Z"
      fill="url(#evoGrad)"
      opacity="0.18"
    />
    <path
      d="M10 65 C 50 60, 80 40, 110 30 S 170 12, 190 8"
      stroke="#e9c349"
      strokeWidth="1.5"
      fill="none"
    />
    <circle cx="190" cy="8" r="3" fill="#e9c349" />
  </svg>
);

const CARDS: CardData[] = [
  {
    art: EspejoArt,
    title: 'Espejo Cognitivo',
    body: 'Reflexión guiada por las preguntas de cada sefirá. La IA observa lo que escribís y devuelve un score de coherencia.',
  },
  {
    art: CalendarioArt,
    title: 'Calendario Cabalístico',
    body: 'Mapeá tus actividades semanales a las dimensiones del alma. Vé el volumen energético de cada sefirá.',
  },
  {
    art: EvolucionArt,
    title: 'Mi Evolución',
    body: 'Curvas mensuales por sefirá: cómo te movés en el tiempo. Score IA vs. score propio, lado a lado.',
  },
];

export default function InicioModulos() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();
  const y = reduced ? 0 : 28;

  return (
    <motion.section
      ref={ref}
      id="modulos"
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className="py-24 md:py-32 px-6"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="ks-eyebrow text-gold mb-6">Módulos</p>
          <h2 className="ks-serif text-4xl md:text-5xl text-ink-glow font-light leading-[1.1]">
            Tres dimensiones del trabajo.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {CARDS.map((card) => (
            <ModuleCard key={card.title} {...card} />
          ))}
        </div>
      </div>
    </motion.section>
  );
}
