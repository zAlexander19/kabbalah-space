import { useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CONNECTIONS, SEFIRA_COLORS, ink } from '../../shared/tokens';
import { useTourStep } from '../../onboarding';

export type SefiraNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  description: string;
};

type Props = {
  sefirot: SefiraNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

// Cascading entry: nodes appear top-to-bottom, ordered by Y. Nodes on the
// same row land at the same time. Seconds between rows.
const STEP_DELAY = 0.14;
const NODE_R = 32;
const SVG_W = 400;
const SVG_H = 880;

export default function SefirotInteractiveTree({ sefirot, selectedId, onSelect }: Props) {
  const reduced = useReducedMotion();
  const treeRootRef = useRef<HTMLDivElement>(null);
  const tiferetRef = useRef<HTMLElement>(null);
  useTourStep(1, treeRootRef as React.RefObject<HTMLElement>);
  useTourStep(2, tiferetRef as React.RefObject<HTMLElement>);

  // Map Y → cascade step so equal-Y nodes share a delay (keter alone,
  // then jojma+bina, etc.). The lightning descends one row at a time.
  const yStep = useMemo(() => {
    const distinct = [...new Set(sefirot.map(s => s.y))].sort((a, b) => a - b);
    return new Map(distinct.map((y, i) => [y, i]));
  }, [sefirot]);

  function nodeDelay(y: number): number {
    if (reduced) return 0;
    return (yStep.get(y) ?? 0) * STEP_DELAY;
  }

  // A connection's "arrival" is when its lower (child) node lands.
  function lineDelay(yA: number, yB: number): number {
    const childY = Math.max(yA, yB);
    return nodeDelay(childY);
  }

  return (
    <div
      ref={treeRootRef}
      className="relative w-[400px] h-[880px] select-none"
      onClick={() => onSelect(null)}
    >
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="espejoSefiraGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="espejoLineShimmer" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"  stopColor={ink.ember} stopOpacity="0" />
            <stop offset="50%" stopColor={ink.ember} stopOpacity="0.6" />
            <stop offset="100%" stopColor={ink.ember} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Connection lines — draw from parent down to child as the cascade descends */}
        {CONNECTIONS.map((c, idx) => {
          const a = sefirot.find(s => s.id === c.n1);
          const b = sefirot.find(s => s.id === c.n2);
          if (!a || !b) return null;
          const dimmed = selectedId !== null && selectedId !== c.n1 && selectedId !== c.n2;
          const delay = lineDelay(a.y, b.y);
          // Shimmer waits until the line itself has finished drawing.
          const shimmerStart = delay + 0.5;
          return (
            <g key={`${c.n1}-${c.n2}`}>
              <motion.line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="rgba(253,230,138,0.42)"
                strokeWidth={2.5}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: 1,
                  opacity: dimmed ? 0.08 : 1,
                }}
                transition={{
                  pathLength: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: 0.5, delay: dimmed ? 0 : delay },
                }}
                style={{ transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1)' }}
              />
              {!reduced && !dimmed && (
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="url(#espejoLineShimmer)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  style={{
                    strokeDasharray: '40 200',
                    animation: `espejoShimmer-${idx} 6s linear infinite`,
                    animationDelay: `${shimmerStart + ((idx * 0.4) % 6)}s`,
                  }}
                />
              )}
              {c.label && (
                <motion.g
                  initial={{ opacity: 0 }}
                  animate={{ opacity: dimmed ? 0.15 : 0.85 }}
                  transition={{ duration: 0.4, delay: delay + 0.2 }}
                >
                  <rect
                    x={(a.x + b.x) / 2 - 11}
                    y={(a.y + b.y) / 2 - 11}
                    width={22} height={22}
                    fill="#070709"
                    rx={11}
                  />
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2}
                    fill="#fef08a"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontFamily: 'David, serif', fontSize: 14 }}
                  >
                    {c.label}
                  </text>
                </motion.g>
              )}
            </g>
          );
        })}

        <style>{`
          ${CONNECTIONS.map((_, idx) => `
            @keyframes espejoShimmer-${idx} {
              0%   { stroke-dashoffset: 240; }
              100% { stroke-dashoffset: 0; }
            }
          `).join('\n')}
        `}</style>

        {/* Sefirot nodes. Each node is positioned by an outer static <g
            transform="translate"> so the inner motion group scales around
            (0,0) — i.e. exactly the node center — instead of around the
            SVG origin, which is what was making selected nodes drift out
            of the connecting lines. */}
        {sefirot.map(node => {
          const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
          const isSelected = selectedId === node.id;
          const isOther = selectedId !== null && !isSelected;
          const delay = nodeDelay(node.y);
          return (
            <g
              key={node.id}
              ref={node.id === 'tiferet' ? (tiferetRef as React.RefObject<any>) : undefined}
              transform={`translate(${node.x},${node.y})`}
            >
              <motion.g
                onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
                style={{ cursor: 'pointer', transformOrigin: '0px 0px' }}
                initial={{ opacity: 0, scale: 0.35 }}
                animate={{
                  opacity: isOther ? 0.28 : 1,
                  scale: isSelected ? 1.14 : 1,
                }}
                transition={{
                  opacity: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] },
                  scale: isSelected
                    ? { type: 'spring', damping: 14, stiffness: 220 }
                    : { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] },
                }}
                whileHover={{ scale: isSelected ? 1.14 : 1.06 }}
              >
                {/* Halo — glows brighter on the selected node */}
                <motion.circle
                  cx={0} cy={0}
                  r={NODE_R + 10}
                  fill={color}
                  filter="url(#espejoSefiraGlow)"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: reduced
                      ? (isSelected ? 0.6 : 0.35)
                      : (isSelected ? [0.45, 0.85, 0.45] : 0.35),
                  }}
                  transition={isSelected && !reduced
                    ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay }
                    : { duration: 0.6, delay }
                  }
                />
                {/* Main circle */}
                <circle
                  cx={0} cy={0} r={NODE_R}
                  fill={color}
                  stroke={isSelected ? 'rgba(255, 245, 228, 0.85)' : 'rgba(255,255,255,0.3)'}
                  strokeWidth={isSelected ? 2 : 1}
                  style={{ transition: 'stroke 300ms, stroke-width 300ms' }}
                />
                {/* Selection ring */}
                {isSelected && (
                  <motion.circle
                    cx={0} cy={0}
                    r={NODE_R + 7}
                    fill="none"
                    stroke="rgba(253, 230, 138, 0.7)"
                    strokeWidth={1.4}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    style={{ transformOrigin: '0px 0px' }}
                  />
                )}
                {/* Label inside the orb */}
                <text
                  x={0} y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="rgba(255, 255, 255, 0.95)"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    pointerEvents: 'none',
                    textShadow: '0 1px 3px rgba(0,0,0,0.7)',
                  }}
                >
                  {node.name.toUpperCase()}
                </text>
              </motion.g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
