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

// Timing (en segundos)
const SINGULARITY_START = 0.0;
const BANG_DELAY = 0.5;
const PARTICLE_BASE_DELAY = 0.6;
const PARTICLE_DURATION = 0.75;
const ORB_SETTLE_DURATION = 0.5;
const TIFERET_PHASE_START = 1.85;
const TIFERET_STAGGER = 0.10;
const TIFERET_DRAW = 0.35;
const OTHER_STAGGER = 0.05;
const OTHER_DRAW = 0.30;
const FADE_OUT = 0.4;

const MAX_DIST = 400;

// Orden Sefirótico para las conexiones de Tiferet
const TIFERET_OUT_ORDER = ['keter', 'jojma', 'bina', 'jesed', 'gevura', 'netzaj', 'hod', 'yesod'];

function distFromCenter(node: SefiraNode): number {
  const dx = node.x - CENTER_X;
  const dy = node.y - CENTER_Y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isTiferetEdge(c: { n1: string; n2: string }): string | null {
  if (c.n1 === 'tiferet') return c.n2;
  if (c.n2 === 'tiferet') return c.n1;
  return null;
}

const TIFERET_PHASE_END = TIFERET_PHASE_START + (TIFERET_OUT_ORDER.length - 1) * TIFERET_STAGGER + TIFERET_DRAW;

export default function EspejoIntro({ sefirot, onComplete }: Props) {
  // Pre-compute delay + duration por conexión
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

  const totalDurationMs = useMemo(() => {
    const otherEnd = TIFERET_PHASE_END + (connectionAnims.otherCount - 1) * OTHER_STAGGER + OTHER_DRAW;
    return Math.round((otherEnd + FADE_OUT) * 1000);
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
          style={{ transformOrigin: `${CENTER_X}px ${CENTER_Y}px`, transformBox: 'fill-box' }}
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
          style={{ transformOrigin: `${CENTER_X}px ${CENTER_Y}px`, transformBox: 'fill-box' }}
        />

        {/* Fase 3 — 10 partículas viajan del centro a la posición de cada sefirá */}
        {/* Cuando llega → halo + orbe se materializan */}
        {sefirot.map(node => {
          const dist = distFromCenter(node);
          const distRatio = dist / MAX_DIST;
          // Ligera variación de delay según distancia (cercanas salen un pelín antes)
          const particleDelay = PARTICLE_BASE_DELAY + distRatio * 0.15;
          // Las cercanas viajan más rápido para llegar todas en una ventana similar
          const particleDuration = PARTICLE_DURATION * (0.7 + distRatio * 0.3);
          const orbDelay = particleDelay + particleDuration - 0.05;
          return (
            <g key={`intro-${node.id}`}>
              {/* Partícula viajera */}
              <motion.circle
                r={2.8}
                fill="#fef9c3"
                filter="url(#introGlow)"
                initial={{ cx: CENTER_X, cy: CENTER_Y, opacity: 0 }}
                animate={{
                  cx: node.x,
                  cy: node.y,
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  cx: { duration: particleDuration, delay: particleDelay, ease: [0.16, 1, 0.3, 1] },
                  cy: { duration: particleDuration, delay: particleDelay, ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: particleDuration, delay: particleDelay, times: [0, 0.08, 0.85, 1] },
                }}
              />

              {/* Halo del orbe (aparece cuando llega la partícula) */}
              <motion.circle
                cx={node.x} cy={node.y} r={42}
                fill={SEFIRA_COLORS[node.id] ?? '#a3a3a3'}
                filter="url(#introGlow)"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 0.45, 0.22], scale: [0, 1.25, 1] }}
                transition={{
                  opacity: { duration: ORB_SETTLE_DURATION, delay: orbDelay, times: [0, 0.4, 1] },
                  scale: { duration: ORB_SETTLE_DURATION, delay: orbDelay, times: [0, 0.5, 1], ease: [0.16, 1, 0.3, 1] },
                }}
                style={{ transformOrigin: `${node.x}px ${node.y}px`, transformBox: 'fill-box' }}
              />

              {/* Orbe principal */}
              <motion.circle
                cx={node.x} cy={node.y} r={32}
                fill={`url(#introOrb-${node.id})`}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={2}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.18, 1], opacity: 1 }}
                transition={{
                  scale: { duration: ORB_SETTLE_DURATION, delay: orbDelay, times: [0, 0.7, 1], ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: 0.3, delay: orbDelay },
                }}
                style={{ transformOrigin: `${node.x}px ${node.y}px`, transformBox: 'fill-box' }}
              />
            </g>
          );
        })}

        {/* Fase 4 — Conexiones: Tiferet primero (orden Sefirótico), después el resto */}
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
      </svg>
    </div>
  );
}
