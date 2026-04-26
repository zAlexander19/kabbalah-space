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
const SINGULARITY_DURATION = 0.6;

// Explosión: las 10 partículas salen del centro disparadas
const PARTICLE_DELAY = 0.45;
const PARTICLE_DURATION = 0.32;

// Orbes: aparecen exactamente donde aterrizó cada partícula
const ORB_DELAY = PARTICLE_DELAY + PARTICLE_DURATION - 0.04; // 0.73
const ORB_DURATION = 0.45;

// Canales: Tiferet primero (Sefirótico), luego outer solapando
const TIFERET_PHASE_START = ORB_DELAY + ORB_DURATION + 0.05; // 1.23
const TIFERET_STAGGER = 0.06;
const CONN_DRAW_TIFERET = 0.28;
const OUTER_OVERLAP = 0.35;
const OUTER_STAGGER = 0.03;
const CONN_DRAW_OUTER = 0.24;

// Nombres sobre las dimensiones (KÉTER, JÉSED, etc.)
const NAMES_STAGGER = 0.04;
const NAMES_DURATION = 0.32;

// Letras hebreas en los canales
const LETTERS_STAGGER = 0.025;
const LETTERS_DURATION = 0.28;

const FADE_OUT = 0.4;

const TIFERET_OUT_ORDER = ['keter', 'jojma', 'bina', 'jesed', 'gevura', 'netzaj', 'hod', 'yesod'];
const SEFIROTIC_ORDER = ['keter', 'jojma', 'bina', 'jesed', 'gevura', 'tiferet', 'netzaj', 'hod', 'yesod', 'maljut'];

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

  const { namesStart, lettersStart, totalDurationMs } = useMemo(() => {
    const outerEnd = connectionAnims.outerStart + (connectionAnims.otherCount - 1) * OUTER_STAGGER + CONN_DRAW_OUTER;
    const allLinesEnd = Math.max(outerEnd, TIFERET_PHASE_END);
    const nStart = allLinesEnd + 0.10;
    const nEnd = nStart + (SEFIROTIC_ORDER.length - 1) * NAMES_STAGGER + NAMES_DURATION;
    const lStart = nEnd - 0.25; // letras arrancan un poco antes de que terminen los nombres
    const lEnd = lStart + (CONNECTIONS.length - 1) * LETTERS_STAGGER + LETTERS_DURATION;
    return {
      namesStart: nStart,
      lettersStart: lStart,
      totalDurationMs: Math.round((Math.max(nEnd, lEnd) + FADE_OUT) * 1000),
    };
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
      <svg viewBox="0 -50 400 880" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="introGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
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

        {/* 1. Singularidad */}
        <motion.circle
          cx={CENTER_X} cy={CENTER_Y}
          fill="#fef9c3"
          filter="url(#introGlow)"
          initial={{ r: 0, opacity: 0 }}
          animate={{ r: [0, 4, 12, 18, 0], opacity: [0, 1, 1, 1, 0] }}
          transition={{
            duration: SINGULARITY_DURATION,
            delay: SINGULARITY_START,
            times: [0, 0.2, 0.55, 0.8, 1],
            ease: [0.16, 1, 0.3, 1],
          }}
        />

        {/* 2. Explosión: las 10 partículas salen disparadas del centro al lugar de cada sefirá */}
        {sefirot.map(node => (
          <motion.circle
            key={`particle-${node.id}`}
            r={2.8}
            fill="#fef9c3"
            filter="url(#introGlow)"
            initial={{ cx: CENTER_X, cy: CENTER_Y, opacity: 0 }}
            animate={{ cx: node.x, cy: node.y, opacity: [0, 1, 1, 0] }}
            transition={{
              cx: { duration: PARTICLE_DURATION, delay: PARTICLE_DELAY, ease: [0, 0, 0.3, 1] },
              cy: { duration: PARTICLE_DURATION, delay: PARTICLE_DELAY, ease: [0, 0, 0.3, 1] },
              opacity: { duration: PARTICLE_DURATION, delay: PARTICLE_DELAY, times: [0, 0.1, 0.85, 1] },
            }}
          />
        ))}

        {/* 3 + 4. Orbes: aparecen donde aterrizó cada partícula. Animamos r, no scale,
            así el círculo siempre crece desde (cx, cy) sin riesgo de transform-origin. */}
        {sefirot.map(node => {
          const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
          return (
            <g key={`orb-${node.id}`}>
              {/* Halo exterior — amplio y suave */}
              <motion.circle
                cx={node.x} cy={node.y}
                fill={color}
                filter="url(#introGlow)"
                initial={{ r: 0, opacity: 0 }}
                animate={{ r: [0, 56, 48], opacity: [0, 0.5, 0.32] }}
                transition={{
                  r: { duration: ORB_DURATION, delay: ORB_DELAY, times: [0, 0.5, 1], ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: ORB_DURATION, delay: ORB_DELAY, times: [0, 0.4, 1] },
                }}
              />
              {/* Halo interior — más brillante, replica el outer glow del orbe real */}
              <motion.circle
                cx={node.x} cy={node.y}
                fill={color}
                filter="url(#introGlow)"
                initial={{ r: 0, opacity: 0 }}
                animate={{ r: [0, 42, 36], opacity: [0, 0.6, 0.45] }}
                transition={{
                  r: { duration: ORB_DURATION, delay: ORB_DELAY, times: [0, 0.55, 1], ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: ORB_DURATION, delay: ORB_DELAY, times: [0, 0.45, 1] },
                }}
              />
              {/* Orbe principal */}
              <motion.circle
                cx={node.x} cy={node.y}
                fill={`url(#introOrb-${node.id})`}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={2}
                initial={{ r: 0, opacity: 0 }}
                animate={{ r: [0, 38, 32], opacity: 1 }}
                transition={{
                  r: { duration: ORB_DURATION, delay: ORB_DELAY, times: [0, 0.7, 1], ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: 0.25, delay: ORB_DELAY },
                }}
              />
            </g>
          );
        })}

        {/* 5. Canales — Tiferet primero (Sefirótico), outer solapado */}
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
              stroke="rgba(253,230,138,0.45)"
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

        {/* 6. Nombres sobre las dimensiones (KÉTER, JÉSED…) en orden Sefirótico */}
        {SEFIROTIC_ORDER.map((sefiraId, idx) => {
          const node = sefirot.find(s => s.id === sefiraId);
          if (!node) return null;
          const delay = namesStart + idx * NAMES_STAGGER;
          return (
            <motion.text
              key={`name-${sefiraId}`}
              x={node.x} y={node.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                pointerEvents: 'none',
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: NAMES_DURATION, delay, ease: [0.22, 1, 0.36, 1] }}
            >
              {node.name.toUpperCase()}
            </motion.text>
          );
        })}

        {/* 7. Letras hebreas en los canales (con su disco oscuro de fondo) */}
        {CONNECTIONS.map((c, idx) => {
          if (!c.label) return null;
          const a = sefirot.find(s => s.id === c.n1);
          const b = sefirot.find(s => s.id === c.n2);
          if (!a || !b) return null;
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const delay = lettersStart + idx * LETTERS_STAGGER;
          return (
            <motion.g
              key={`letter-${idx}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: LETTERS_DURATION,
                delay,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <rect x={midX - 11} y={midY - 11} width={22} height={22} fill="#070709" rx={11} opacity={0.85} />
              <text
                x={midX} y={midY}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fef08a"
                style={{ fontFamily: 'David, serif', fontSize: 14, opacity: 0.9 }}
              >
                {c.label}
              </text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
