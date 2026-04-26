import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { SefiraNode, VolumeItem } from '../types';
import { CONNECTIONS, SEFIRA_COLORS, ink } from '../../shared/tokens';
import { randomBreathDelay } from '../motion/breath';

type Props = {
  sefirot: SefiraNode[];
  volume: VolumeItem[];
  filterId: string | null;
  onFilterToggle: (id: string) => void;
};

type HoverState = { id: string; x: number; y: number } | null;

export default function SefirotTree({ sefirot, volume, filterId, onFilterToggle }: Props) {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<HoverState>(null);

  const volumeMap = useMemo(() => {
    const m: Record<string, VolumeItem> = {};
    for (const v of volume) m[v.sefira_id] = v;
    return m;
  }, [volume]);

  const maxCount = Math.max(1, ...volume.map(v => v.actividades_total));

  const nodeDelays = useMemo(() => {
    const d: Record<string, number> = {};
    for (const s of sefirot) d[s.id] = randomBreathDelay();
    return d;
  }, [sefirot]);

  const hoveredNode = hover ? sefirot.find(s => s.id === hover.id) : null;
  const hoveredVolume = hover ? volumeMap[hover.id] : null;

  return (
    <div className="relative w-full" style={{ aspectRatio: '400 / 800', maxWidth: 360, margin: '0 auto' }}>
      <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full">
        <defs>
          <filter id="sefiraGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="lineShimmer" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"  stopColor={ink.ember} stopOpacity="0" />
            <stop offset="50%" stopColor={ink.ember} stopOpacity="0.6" />
            <stop offset="100%" stopColor={ink.ember} stopOpacity="0" />
          </linearGradient>
        </defs>

        {CONNECTIONS.map((c, idx) => {
          const a = sefirot.find(s => s.id === c.n1);
          const b = sefirot.find(s => s.id === c.n2);
          if (!a || !b) return null;
          const dimmed = filterId !== null && filterId !== c.n1 && filterId !== c.n2;
          return (
            <g key={`${c.n1}-${c.n2}`}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="rgba(253,230,138,0.18)"
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={dimmed ? 0.05 : 1}
                style={{ transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1)' }}
              />
              {!reduced && !dimmed && (
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="url(#lineShimmer)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  style={{
                    strokeDasharray: '40 200',
                    animation: `shimmer-${idx} 6s linear infinite`,
                    animationDelay: `${(idx * 0.4) % 6}s`,
                  }}
                />
              )}
            </g>
          );
        })}

        <style>{`
          ${CONNECTIONS.map((_, idx) => `
            @keyframes shimmer-${idx} {
              0%   { stroke-dashoffset: 240; }
              100% { stroke-dashoffset: 0; }
            }
          `).join('\n')}
        `}</style>

        {sefirot.map(node => {
          const v = volumeMap[node.id];
          const count = v?.actividades_total ?? 0;
          const ratio = Math.sqrt(count / maxCount);
          const r = 24 + ratio * 22;
          const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
          const isActive = filterId === node.id;
          const isOther = filterId !== null && !isActive;

          return (
            <motion.g
              key={node.id}
              onClick={() => onFilterToggle(node.id)}
              onMouseEnter={() => setHover({ id: node.id, x: node.x, y: node.y })}
              onMouseLeave={() => setHover(prev => (prev?.id === node.id ? null : prev))}
              style={{ cursor: 'pointer', transformOrigin: `${node.x}px ${node.y}px` }}
              animate={{ opacity: isOther ? 0.25 : 1, scale: isActive ? 1.12 : 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              {!reduced && (
                <circle
                  cx={node.x} cy={node.y} r={r + 6}
                  fill={color}
                  filter="url(#sefiraGlow)"
                  className={isActive ? 'cal-breath-fast' : 'cal-breath-halo'}
                  style={{ animationDelay: `${nodeDelays[node.id]}s`, transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}
                />
              )}
              <circle
                cx={node.x} cy={node.y} r={r}
                fill={color}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1}
                className={reduced ? undefined : 'cal-breath-scale'}
                style={{ animationDelay: `${nodeDelays[node.id]}s`, transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}
              />
              <text
                x={node.x} y={node.y - 4}
                textAnchor="middle"
                fill="rgba(255,255,255,0.92)"
                style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', pointerEvents: 'none' }}
              >
                {node.name.toUpperCase()}
              </text>
              <text
                x={node.x} y={node.y + 8}
                textAnchor="middle"
                fill="rgba(255,255,255,0.7)"
                style={{ fontSize: 8, pointerEvents: 'none' }}
              >
                {count}
              </text>
            </motion.g>
          );
        })}
      </svg>

      <AnimatePresence>
        {hoveredNode && (
          <motion.div
            key={hoveredNode.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute pointer-events-none z-20 bg-[#0e1014]/95 border border-stone-700/50 rounded-lg px-3 py-2 shadow-xl backdrop-blur"
            style={{
              left: `${(hoveredNode.x / 400) * 100}%`,
              top: `${(hoveredNode.y / 800) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 18px))',
              minWidth: 160,
            }}
          >
            <p className="text-[11px] font-semibold text-amber-100 uppercase tracking-wider">{hoveredNode.name}</p>
            {hoveredNode.description && (
              <p className="text-[10px] text-stone-300/80 mt-1 leading-snug">{hoveredNode.description}</p>
            )}
            <p className="text-[10px] text-amber-200/80 mt-1 tabular-nums">
              {hoveredVolume?.actividades_total ?? 0} act. · {hoveredVolume?.horas_total ?? 0} h
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
