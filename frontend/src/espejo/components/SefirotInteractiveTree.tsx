import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { SefiraResumen } from '../types';
import { CONNECTIONS, SEFIRA_COLORS, ink } from '../../shared/tokens';

export type SefiraNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  description: string;
};

type Props = {
  sefirot: SefiraNode[];
  summary: SefiraResumen[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function SefirotInteractiveTree({ sefirot, summary, selectedId, onSelect }: Props) {
  const reduced = useReducedMotion();
  const summaryMap = useMemo(() => {
    const m: Record<string, SefiraResumen> = {};
    for (const s of summary) m[s.sefira_id] = s;
    return m;
  }, [summary]);

  function intensityOf(id: string): number {
    return summaryMap[id]?.intensidad ?? 0;
  }

  return (
    <div className="relative w-[400px] h-[800px] select-none">
      <svg viewBox="0 0 400 800" className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="espejoLineShimmer" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={ink.ember} stopOpacity="0" />
            <stop offset="50%" stopColor={ink.ember} stopOpacity="0.6" />
            <stop offset="100%" stopColor={ink.ember} stopOpacity="0" />
          </linearGradient>
          <filter id="treeNodeGlow" filterUnits="userSpaceOnUse" x="-100" y="-100" width="600" height="1000">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {CONNECTIONS.map((c, idx) => {
          const a = sefirot.find(s => s.id === c.n1);
          const b = sefirot.find(s => s.id === c.n2);
          if (!a || !b) return null;
          const dimmed = selectedId !== null && selectedId !== c.n1 && selectedId !== c.n2;
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
                  stroke="url(#espejoLineShimmer)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  style={{
                    strokeDasharray: '40 200',
                    animation: `espejoShimmer-${idx} 6s linear infinite`,
                    animationDelay: `${(idx * 0.4) % 6}s`,
                  }}
                />
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

        {sefirot.map(node => {
          const intensity = intensityOf(node.id);
          const haloR = 38 + intensity * 28;
          const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
          return (
            <circle
              key={`halo-${node.id}`}
              cx={node.x} cy={node.y} r={haloR}
              fill={color}
              filter="url(#treeNodeGlow)"
              opacity={0.18 + intensity * 0.32}
              style={{ transition: 'opacity 600ms cubic-bezier(0.16,1,0.3,1), r 600ms cubic-bezier(0.16,1,0.3,1)' }}
            />
          );
        })}
      </svg>

      {sefirot.map(node => {
        const intensity = intensityOf(node.id);
        const isSelected = selectedId === node.id;
        const orbOpacity = 0.4 + intensity * 0.6;
        const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
        return (
          <div
            key={node.id}
            onClick={() => onSelect(node.id)}
            className={`absolute w-16 h-16 sm:w-20 sm:h-20 -ml-8 -mt-8 sm:-ml-10 sm:-mt-10 rounded-full flex items-center justify-center cursor-pointer z-10 ${isSelected ? 'ring-4 ring-amber-300/70 ring-offset-4 ring-offset-[#070709]' : ''}`}
            style={{
              left: node.x,
              top: node.y,
              opacity: orbOpacity,
              background: `radial-gradient(circle at 30% 30%, ${color}ff 0%, ${color}aa 60%, ${color}55 100%)`,
              border: '2px solid rgba(255,255,255,0.2)',
              boxShadow: `inset -8px -8px 16px rgba(0,0,0,0.6), inset 8px 8px 16px rgba(255,255,255,0.3), 0 0 ${10 + intensity * 30}px ${color}88`,
              transform: isSelected ? 'scale(1.15)' : 'scale(1)',
              transition: 'opacity 600ms, box-shadow 600ms, transform 300ms cubic-bezier(0.22,1,0.36,1)',
            }}
            title={node.description}
          >
            <span className="text-[10px] font-bold tracking-widest text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {node.name.toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
