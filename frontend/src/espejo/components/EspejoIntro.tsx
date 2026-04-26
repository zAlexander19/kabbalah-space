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
const TOTAL_DURATION_MS = 2800;

function distFromCenter(node: SefiraNode): number {
  const dx = node.x - CENTER_X;
  const dy = node.y - CENTER_Y;
  return Math.sqrt(dx * dx + dy * dy);
}

const MAX_DIST = 400;

const PARTICLE_COUNT = 42;
const PARTICLE_COLORS = ['#fef9c3', '#fde68a', '#fbbf24', '#f59e0b', '#fef3c7'];

type Particle = {
  targetX: number;
  targetY: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
};

function buildParticles(): Particle[] {
  // Distribución uniforme en círculo + jitter pseudo-determinista por índice
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const baseAngle = (i / PARTICLE_COUNT) * Math.PI * 2;
    const jitter = (((i * 37) % 23) / 23 - 0.5) * 0.4;
    const angle = baseAngle + jitter;
    const distance = 180 + ((i * 47) % 240);
    const targetX = CENTER_X + Math.cos(angle) * distance;
    const targetY = CENTER_Y + Math.sin(angle) * distance;
    const size = 1.2 + ((i * 23) % 7) * 0.35;
    const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];
    const delay = 0.55 + ((i * 13) % 35) / 100;
    const duration = 1.0 + ((i * 17) % 40) / 60;
    return { targetX, targetY, size, color, delay, duration };
  });
}

export default function EspejoIntro({ sefirot, onComplete }: Props) {
  const particles = useMemo(buildParticles, []);

  useEffect(() => {
    const t = window.setTimeout(onComplete, TOTAL_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [onComplete]);

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

        {/* Singularidad: punto luminoso pulsante en el centro */}
        <motion.circle
          cx={CENTER_X} cy={CENTER_Y} r={3}
          fill="#fef9c3"
          filter="url(#introGlow)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1, 4, 8, 0], opacity: [0, 1, 1, 1, 0] }}
          transition={{ duration: 1.1, times: [0, 0.15, 0.45, 0.7, 1], ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: `${CENTER_X}px ${CENTER_Y}px`, transformBox: 'fill-box' }}
        />

        {/* Big Bang: flash radial expansivo */}
        <motion.circle
          cx={CENTER_X} cy={CENTER_Y} r={2}
          fill="url(#bigBangFlash)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 250], opacity: [0, 0.85, 0] }}
          transition={{
            scale: { duration: 1.0, delay: 0.5, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: 1.0, delay: 0.5, times: [0, 0.25, 1] },
          }}
          style={{ transformOrigin: `${CENTER_X}px ${CENTER_Y}px`, transformBox: 'fill-box' }}
        />

        {/* Partículas: stardust irradiando desde el centro */}
        {particles.map((p, i) => (
          <motion.circle
            key={`particle-${i}`}
            r={p.size}
            fill={p.color}
            initial={{ cx: CENTER_X, cy: CENTER_Y, opacity: 0 }}
            animate={{ cx: p.targetX, cy: p.targetY, opacity: [0, 1, 1, 0] }}
            transition={{
              cx: { duration: p.duration, delay: p.delay, ease: [0.16, 1, 0.3, 1] },
              cy: { duration: p.duration, delay: p.delay, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: p.duration, delay: p.delay, times: [0, 0.08, 0.55, 1] },
            }}
          />
        ))}

        {/* Conexiones: se dibujan después de que aparecen ambos extremos */}
        {CONNECTIONS.map((c, idx) => {
          const a = sefirot.find(s => s.id === c.n1);
          const b = sefirot.find(s => s.id === c.n2);
          if (!a || !b) return null;
          const distA = distFromCenter(a);
          const distB = distFromCenter(b);
          const maxDelay = Math.max(distA, distB) / MAX_DIST * 0.7;
          const lineDelay = 1.0 + maxDelay + 0.5;
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
                pathLength: { duration: 0.5, delay: lineDelay, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.3, delay: lineDelay },
              }}
            />
          );
        })}

        {/* Sefirot: chispas desde el centro y orbes que se materializan */}
        {sefirot.map(node => {
          const dist = distFromCenter(node);
          const sparkDelay = 1.0 + (dist / MAX_DIST) * 0.7;
          const orbDelay = sparkDelay + 0.35;
          return (
            <g key={`intro-node-${node.id}`}>
              {/* chispa: línea fina dorada del centro al destino */}
              <motion.line
                x1={CENTER_X} y1={CENTER_Y} x2={node.x} y2={node.y}
                stroke="#fef9c3"
                strokeWidth={1.2}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: [0, 0.9, 0] }}
                transition={{
                  pathLength: { duration: 0.4, delay: sparkDelay, ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: 0.45, delay: sparkDelay, times: [0, 0.5, 1] },
                }}
              />
              {/* halo del orbe */}
              <motion.circle
                cx={node.x} cy={node.y} r={42}
                fill={SEFIRA_COLORS[node.id] ?? '#a3a3a3'}
                filter="url(#introGlow)"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 0.4, 0.22], scale: [0, 1.2, 1] }}
                transition={{
                  opacity: { duration: 0.6, delay: orbDelay, times: [0, 0.4, 1] },
                  scale: { duration: 0.6, delay: orbDelay, times: [0, 0.5, 1], ease: [0.16, 1, 0.3, 1] },
                }}
                style={{ transformOrigin: `${node.x}px ${node.y}px`, transformBox: 'fill-box' }}
              />
              {/* orbe principal */}
              <motion.circle
                cx={node.x} cy={node.y} r={32}
                fill={`url(#introOrb-${node.id})`}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={2}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.18, 1], opacity: 1 }}
                transition={{
                  scale: { duration: 0.55, delay: orbDelay, times: [0, 0.7, 1], ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: 0.3, delay: orbDelay },
                }}
                style={{ transformOrigin: `${node.x}px ${node.y}px`, transformBox: 'fill-box' }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
