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
const MAX_DIST = 400;

// Timing (segundos) — pensado para que las fases se solapen y fluyan
const SINGULARITY_START = 0.0;
const SINGULARITY_DURATION = 0.85;

const BANG_DELAY = 0.40;
const BANG_DURATION = 0.85;

// Particle jump: las cercanas salen un toque antes, todas duran 180ms
const PARTICLE_BASE_DELAY = 0.55;
const PARTICLE_SCATTER = 0.22; // ventana de delays según distancia
const PARTICLE_DURATION = 0.18;

const ORB_DURATION = 0.45;

// Conexiones — Tiferet primero, outer arranca solapado
const TIFERET_PHASE_START = 1.05;
const TIFERET_STAGGER = 0.07;
const CONN_DRAW_TIFERET = 0.28;

const OUTER_OVERLAP = 0.45; // outer arranca cuando Tiferet va por la mitad
const OUTER_STAGGER = 0.04;
const CONN_DRAW_OUTER = 0.25;

// Onda de energía: un solo movimiento que recorre el árbol y pulsa cada sefirá al pasar
const WAVE_START = 2.25;
const WAVE_DURATION = 0.75;
const PULSE_DURATION = 0.4;

const FADE_OUT = 0.4;

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

const TIFERET_PHASE_END = TIFERET_PHASE_START + (TIFERET_OUT_ORDER.length - 1) * TIFERET_STAGGER + CONN_DRAW_TIFERET;

export default function EspejoIntro({ sefirot, onComplete }: Props) {
  const connectionAnims = useMemo(() => {
    const map = new Map<string, { delay: number; duration: number }>();
    const outerStart = TIFERET_PHASE_START + OUTER_OVERLAP;
    let otherIdx = 0;
    for (const c of CONNECTIONS) {
      const key = `${c.n1}-${c.n2}`;
      const otherEnd = isTiferetEdge(c);
      if (otherEnd !== null) {
        const idx = TIFERET_OUT_ORDER.indexOf(otherEnd);
        const delay = TIFERET_PHASE_START + Math.max(0, idx) * TIFERET_STAGGER;
        map.set(key, { delay, duration: CONN_DRAW_TIFERET });
      } else {
        const delay = outerStart + otherIdx * OUTER_STAGGER;
        map.set(key, { delay, duration: CONN_DRAW_OUTER });
        otherIdx++;
      }
    }
    return { map, otherCount: otherIdx, outerStart };
  }, []);

  const totalDurationMs = useMemo(() => {
    const outerEnd = connectionAnims.outerStart + (connectionAnims.otherCount - 1) * OUTER_STAGGER + CONN_DRAW_OUTER;
    const waveEnd = WAVE_START + WAVE_DURATION;
    const pulseEnd = WAVE_START + WAVE_DURATION + PULSE_DURATION;
    const last = Math.max(outerEnd, waveEnd, pulseEnd, TIFERET_PHASE_END);
    return Math.round((last + FADE_OUT) * 1000);
  }, [connectionAnims]);

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
          <radialGradient id="energyWave" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef9c3" stopOpacity="0" />
            <stop offset="80%" stopColor="#fde68a" stopOpacity="0.18" />
            <stop offset="95%" stopColor="#fbbf24" stopOpacity="0.4" />
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

        {/* Singularidad */}
        <motion.circle
          cx={CENTER_X} cy={CENTER_Y} r={3}
          fill="#fef9c3"
          filter="url(#introGlow)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1, 4, 8, 0], opacity: [0, 1, 1, 1, 0] }}
          transition={{
            duration: SINGULARITY_DURATION,
            delay: SINGULARITY_START,
            times: [0, 0.18, 0.5, 0.75, 1],
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        />

        {/* Big Bang flash */}
        <motion.circle
          cx={CENTER_X} cy={CENTER_Y} r={2}
          fill="url(#bigBangFlash)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 250], opacity: [0, 0.85, 0] }}
          transition={{
            scale: { duration: BANG_DURATION, delay: BANG_DELAY, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: BANG_DURATION, delay: BANG_DELAY, times: [0, 0.25, 1] },
          }}
          style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        />

        {/* Partículas: cascada de salidas según distancia (cercanas salen antes) */}
        {sefirot.map(node => {
          const dist = distFromCenter(node);
          const distRatio = dist / MAX_DIST;
          const particleDelay = PARTICLE_BASE_DELAY + distRatio * PARTICLE_SCATTER;
          return (
            <motion.circle
              key={`particle-${node.id}`}
              r={2.5}
              fill="#fef9c3"
              filter="url(#introGlow)"
              initial={{ cx: CENTER_X, cy: CENTER_Y, opacity: 0 }}
              animate={{ cx: node.x, cy: node.y, opacity: [0, 1, 1, 0] }}
              transition={{
                cx: { duration: PARTICLE_DURATION, delay: particleDelay, ease: [0.16, 1, 0.3, 1] },
                cy: { duration: PARTICLE_DURATION, delay: particleDelay, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: PARTICLE_DURATION, delay: particleDelay, times: [0, 0.15, 0.75, 1] },
              }}
            />
          );
        })}

        {/* Orbes: cada uno se materializa cuando llega su partícula */}
        {sefirot.map(node => {
          const dist = distFromCenter(node);
          const distRatio = dist / MAX_DIST;
          const particleDelay = PARTICLE_BASE_DELAY + distRatio * PARTICLE_SCATTER;
          const orbDelay = particleDelay + PARTICLE_DURATION - 0.03;
          return (
            <g key={`orb-${node.id}`}>
              <motion.circle
                cx={node.x} cy={node.y} r={42}
                fill={SEFIRA_COLORS[node.id] ?? '#a3a3a3'}
                filter="url(#introGlow)"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 0.45, 0.22], scale: [0, 1.25, 1] }}
                transition={{
                  opacity: { duration: ORB_DURATION, delay: orbDelay, times: [0, 0.4, 1] },
                  scale: { duration: ORB_DURATION, delay: orbDelay, times: [0, 0.5, 1], ease: [0.16, 1, 0.3, 1] },
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
                  scale: { duration: ORB_DURATION, delay: orbDelay, times: [0, 0.7, 1], ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: 0.25, delay: orbDelay },
                }}
                style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
              />
            </g>
          );
        })}

        {/* Conexiones — Tiferet primero (Sefirótico), outer solapa */}
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
                opacity: { duration: 0.2, delay: anim.delay },
              }}
            />
          );
        })}

        {/* Onda radial: un único anillo que se expande del centro hacia afuera */}
        <motion.circle
          cx={CENTER_X} cy={CENTER_Y}
          fill="none"
          stroke="url(#energyWave)"
          strokeWidth={20}
          initial={{ r: 0, opacity: 0 }}
          animate={{ r: [0, 420], opacity: [0, 0.5, 0] }}
          transition={{
            r: { duration: WAVE_DURATION, delay: WAVE_START, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: WAVE_DURATION, delay: WAVE_START, times: [0, 0.35, 1] },
          }}
        />

        {/* Cada sefirá pulsa cuando la onda la toca (delay según distancia al centro) */}
        {sefirot.map(node => {
          const dist = distFromCenter(node);
          const pulseDelay = WAVE_START + (dist / MAX_DIST) * WAVE_DURATION * 0.85;
          const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
          return (
            <motion.circle
              key={`pulse-${node.id}`}
              cx={node.x} cy={node.y} r={36}
              fill={color}
              filter="url(#introGlow)"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: [0, 0.65, 0], scale: [0.85, 1.4, 1.4] }}
              transition={{
                duration: PULSE_DURATION,
                delay: pulseDelay,
                times: [0, 0.4, 1],
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
