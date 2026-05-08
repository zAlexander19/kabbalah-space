import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import InicioSection from './InicioSection';
import { CONNECTIONS } from '../../shared/tokens';

const ease = [0.16, 1, 0.3, 1] as const;

const TREE_NODES: { id: string; cx: number; cy: number }[] = [
  { id: 'keter',   cx: 200, cy: 80 },
  { id: 'jojma',   cx: 320, cy: 180 },
  { id: 'bina',    cx: 80,  cy: 180 },
  { id: 'jesed',   cx: 320, cy: 310 },
  { id: 'gevura',  cx: 80,  cy: 310 },
  { id: 'tiferet', cx: 200, cy: 410 },
  { id: 'netzaj',  cx: 320, cy: 530 },
  { id: 'hod',     cx: 80,  cy: 530 },
  { id: 'yesod',   cx: 200, cy: 630 },
  { id: 'maljut',  cx: 200, cy: 750 },
];
const NODE_R = 14;
const STROKE = 'rgba(253,230,138,0.35)';

/**
 * Section 5 — La herramienta. Describes what Kabbalah Space *does*. The
 * decorative SVG is a stripped-down Tree of Life silhouette — empty
 * circles and the 22 connections — drawn with `pathLength` when the
 * section enters the viewport. No colour fills; the contrast against
 * the real, vivid Tree later is the point.
 */
export default function Section5Tool() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const inView = useInView(svgRef, { once: true, margin: '0px 0px -10% 0px' });
  const reduced = useReducedMotion();

  return (
    <InicioSection className="text-center">
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-4">
        Kabbalah Space mapea diez dimensiones del alma
      </p>
      <p className="font-serif italic text-base md:text-lg text-stone-400 leading-relaxed mb-4">
        — las sefirot del Árbol de la Vida —
      </p>
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-2">
        para que observes cómo se mueve cada una
        <br />
        en tu vida diaria.
      </p>
      <p className="font-serif text-lg md:text-xl text-stone-200 leading-relaxed mb-12">
        Reflexionás, registrás actividades,
        <br />
        y el árbol te devuelve lo que está vibrando
        <br />
        y lo que está callado.
      </p>

      <svg
        ref={svgRef}
        viewBox="0 0 400 830"
        className="block mx-auto w-full max-w-xs md:max-w-sm"
        aria-hidden
      >
        {/* Connections drawn first so the nodes render on top. */}
        {CONNECTIONS.map((c, i) => {
          const a = TREE_NODES.find((n) => n.id === c.n1);
          const b = TREE_NODES.find((n) => n.id === c.n2);
          if (!a || !b) return null;
          return (
            <motion.line
              key={`${c.n1}-${c.n2}`}
              x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
              stroke={STROKE} strokeWidth={1.2} strokeLinecap="round"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: inView ? 1 : reduced ? 1 : 0 }}
              transition={{ duration: 0.6, ease, delay: reduced ? 0 : i * 0.05 }}
            />
          );
        })}
        {/* Empty circles for each sefirá — fade in after lines start. */}
        {TREE_NODES.map((n, i) => (
          <motion.circle
            key={n.id}
            cx={n.cx} cy={n.cy} r={NODE_R}
            fill="rgba(253,230,138,0.05)"
            stroke={STROKE} strokeWidth={1.2}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: inView ? 1 : reduced ? 1 : 0 }}
            transition={{ duration: 0.4, ease, delay: reduced ? 0 : 1.3 + i * 0.08 }}
          />
        ))}
      </svg>
    </InicioSection>
  );
}
