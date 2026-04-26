import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { SefiraNode } from './SefirotInteractiveTree';
import { CONNECTIONS, SEFIRA_COLORS } from '../../shared/tokens';

type Props = {
  sefirot: SefiraNode[];
  onComplete: () => void;
};

const CENTER_X = 200;
const CENTER_Y = 380;

// Timing (segundos)
const SINGULARITY_START = 0.0;
const BANG_DELAY = 0.5;
const PARTICLE_DELAY = 0.65;
const PARTICLE_DURATION = 0.18; // jump rápido — apenas perceptible como movimiento
const ORB_DELAY = PARTICLE_DELAY + PARTICLE_DURATION - 0.03;
const ORB_DURATION = 0.5;

const TIFERET_PHASE_START = ORB_DELAY + ORB_DURATION + 0.05;
const TIFERET_STAGGER = 0.10;
const TIFERET_DRAW = 0.35;

const OTHER_STAGGER = 0.05;
const OTHER_DRAW = 0.30;

const HIGHLIGHT_STAGGER = 0.07;
const HIGHLIGHT_DURATION = 0.45;

const FADE_OUT = 0.4;

// Orden Sefirótico para las conexiones que parten de Tiferet
const TIFERET_OUT_ORDER = ['keter', 'jojma', 'bina', 'jesed', 'gevura', 'netzaj', 'hod', 'yesod'];

// Orden Sefirótico completo para el highlight final (Keter → Maljut)
const SEFIROTIC_ORDER = ['keter', 'jojma', 'bina', 'jesed', 'gevura', 'tiferet', 'netzaj', 'hod', 'yesod', 'maljut'];

function isTiferetEdge(c: { n1: string; n2: string }): string | null {
  if (c.n1 === 'tiferet') return c.n2;
  if (c.n2 === 'tiferet') return c.n1;
  return null;
}

const TIFERET_PHASE_END = TIFERET_PHASE_START + (TIFERET_OUT_ORDER.length - 1) * TIFERET_STAGGER + TIFERET_DRAW;

export default function EspejoIntro({ sefirot, onComplete }: Props) {
  // Pre-compute delay/duration por conexión
  const connectionAnims = useMemo(() => {
    const map = new Map<string, { delay: number; duration: number }>();
    let otherIdx = 0;
    for (const c of CONNECTIONS) {
      const key = `${c.n1}-${c.n2}`;
      const otherEnd = isTiferetEdge(c);
      if (otherEnd !== null) {
        const idx = TIFERET_OUT_ORDER.indexOf(otherEnd);
        const delay = TIFERET_PHASE_START + Math.max(0, idx) * TIFERET_STAGGER;
        map.set(key, { delay, duration: TIFERET_DRAW });
      } else {
        const delay = TIFERET_PHASE_END + otherIdx * OTHER_STAGGER;
        map.set(key, { delay, duration: OTHER_DRAW });
        otherIdx++;
      }
    }
    return { map, otherCount: otherIdx };
  }, []);

  const { highlightStart, totalDurationMs } = useMemo(() => {
    const otherEnd = TIFERET_PHASE_END + (connectionAnims.otherCount - 1) * OTHER_STAGGER + OTHER_DRAW;
    const hStart = otherEnd + 0.15;
    const hEnd = hStart + (SEFIROTIC_ORDER.length - 1) * HIGHLIGHT_STAGGER + HIGHLIGHT_DURATION;
    return {
      highlightStart: hStart,
      totalDurationMs: Math.round((hEnd + FADE_OUT) * 1000),
    };
  }, [connectionAnims.otherCount]);

  useEffect(() => {
    const t = window.setTimeout(onComplete, totalDurationMs);
    return () => window.clearTimeout(t);
  }, [onComplete, totalDurationMs]);

  return (
    <div
      className="absolute inset-0 z-40 cursor-pointer"
      onClick={onComplete}
      title="Saltar"
    >
      <svg viewBox="0 0 400 800" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="bigBangFlash" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef9c3" stopOpacity="1" />
            <stop offset="30%" stopColor="#fde68a" stopOpacity="0.7" />
            <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>
          <filter id="introGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {sefirot.map(node => {
            const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
            return (
              <radialGradient key={node.id} id={`introOrb-${node.id}`} cx="30%" cy="30%" r="65%">
                <stop offset="0%" stopColor={color} stopOpacity="1" />
                <stop offset="60%" stopColor={color} stopOpacity="0.75" />
                <stop offset="100%" stopColor={color} stopOpacity="0.35" />
              </radialGradient>
            );
          })}
        </defs>

        {/* Fase 1 — Singularidad */}
        <motion.circle
          cx={CENTER_X} cy={CENTER_Y} r={3}
          fill="#fef9c3"
          filter="url(#introGlow)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1, 4, 8, 0], opacity: [0, 1, 1, 1, 0] }}
          transition={{
            duration: 1.0,
            delay: SINGULARITY_START,
            times: [0, 0.15, 0.45, 0.7, 1],
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        />

        {/* Fase 2 — Big Bang flash */}
        <motion.circle
          cx={CENTER_X} cy={CENTER_Y} r={2}
          fill="url(#bigBangFlash)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 250], opacity: [0, 0.85, 0] }}
          transition={{
            scale: { duration: 1.0, delay: BANG_DELAY, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: 1.0, delay: BANG_DELAY, times: [0, 0.25, 1] },
          }}
          style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        />

        {/* Fase 3 — 10 partículas saltan rápido del centro a su posición */}
        {sefirot.map(node => (
          <motion.circle
            key={`particle-${node.id}`}
            r={2.5}
            fill="#fef9c3"
            filter="url(#introGlow)"
            initial={{ cx: CENTER_X, cy: CENTER_Y, opacity: 0 }}
            animate={{ cx: node.x, cy: node.y, opacity: [0, 1, 1, 0] }}
            transition={{
              cx: { duration: PARTICLE_DURATION, delay: PARTICLE_DELAY, ease: [0.16, 1, 0.3, 1] },
              cy: { duration: PARTICLE_DURATION, delay: PARTICLE_DELAY, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: PARTICLE_DURATION, delay: PARTICLE_DELAY, times: [0, 0.15, 0.75, 1] },
            }}
          />
        ))}

        {/* Fase 4 — Orbes se materializan en su posición exacta */}
        {sefirot.map(node => (
          <g key={`orb-${node.id}`}>
            <motion.circle
              cx={node.x} cy={node.y} r={42}
              fill={SEFIRA_COLORS[node.id] ?? '#a3a3a3'}
              filter="url(#introGlow)"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 0.45, 0.22], scale: [0, 1.25, 1] }}
              transition={{
                opacity: { duration: ORB_DURATION, delay: ORB_DELAY, times: [0, 0.4, 1] },
                scale: { duration: ORB_DURATION, delay: ORB_DELAY, times: [0, 0.5, 1], ease: [0.16, 1, 0.3, 1] },
              }}
              style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
            />
            <motion.circle
              cx={node.x} cy={node.y} r={32}
              fill={`url(#introOrb-${node.id})`}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={2}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.18, 1], opacity: 1 }}
              transition={{
                scale: { duration: ORB_DURATION, delay: ORB_DELAY, times: [0, 0.7, 1], ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.25, delay: ORB_DELAY },
              }}
              style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
            />
          </g>
        ))}

        {/* Fase 5 — Conexiones: Tiferet primero (orden Sefirótico), luego el resto */}
        {CONNECTIONS.map((c, idx) => {
          const a = sefirot.find(s => s.id === c.n1);
          const b = sefirot.find(s => s.id === c.n2);
          if (!a || !b) return null;
          const key = `${c.n1}-${c.n2}`;
          const anim = connectionAnims.map.get(key);
          if (!anim) return null;
          return (
            <motion.line
              key={`intro-line-${idx}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="rgba(253,230,138,0.55)"
              strokeWidth={2.5}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{
                pathLength: { duration: anim.duration, delay: anim.delay, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.25, delay: anim.delay },
              }}
            />
          );
        })}

        {/* Fase 6 — Highlight: cada sefirá pulsa en orden Sefirótico sobre las líneas */}
        {SEFIROTIC_ORDER.map((sefiraId, idx) => {
          const node = sefirot.find(s => s.id === sefiraId);
          if (!node) return null;
          const color = SEFIRA_COLORS[sefiraId] ?? '#a3a3a3';
          const delay = highlightStart + idx * HIGHLIGHT_STAGGER;
          return (
            <motion.circle
              key={`highlight-${sefiraId}`}
              cx={node.x} cy={node.y} r={36}
              fill={color}
              filter="url(#introGlow)"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: [0, 0.75, 0], scale: [0.85, 1.45, 1.45] }}
              transition={{
                duration: HIGHLIGHT_DURATION,
                delay,
                times: [0, 0.35, 1],
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
            />
          );
        })}
      </svg>
    </div>
  );
}
