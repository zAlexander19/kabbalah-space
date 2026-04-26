import { useReducedMotion } from 'framer-motion';
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
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export default function SefirotInteractiveTree({ sefirot, selectedId, onSelect }: Props) {
  const reduced = useReducedMotion();

  return (
    <div
      className="relative w-[400px] h-[800px] select-none"
      onClick={() => onSelect(null)}
    >
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
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          return (
            <g key={`${c.n1}-${c.n2}`} style={{ transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1)' }} opacity={dimmed ? 0.12 : 1}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="rgba(253,230,138,0.42)"
                strokeWidth={2.5}
                strokeLinecap="round"
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
              {c.label && (
                <>
                  <rect x={midX - 11} y={midY - 11} width={22} height={22} fill="#070709" rx={11} opacity={0.85} />
                  <text x={midX} y={midY} fill="#fef08a" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: 'David, serif', fontSize: 14, opacity: 0.85 }}>{c.label}</text>
                </>
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
          const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
          return (
            <g key={`halo-${node.id}`}>
              <circle
                cx={node.x} cy={node.y} r={48}
                fill={color}
                filter="url(#treeNodeGlow)"
                opacity={0.32}
              />
              <circle
                cx={node.x} cy={node.y} r={36}
                fill={color}
                filter="url(#treeNodeGlow)"
                opacity={0.45}
              />
            </g>
          );
        })}
      </svg>

      {sefirot.map(node => {
        const isSelected = selectedId === node.id;
        const color = SEFIRA_COLORS[node.id] ?? '#a3a3a3';
        return (
          <div
            key={node.id}
            onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
            className={`absolute w-16 h-16 sm:w-20 sm:h-20 -ml-8 -mt-8 sm:-ml-10 sm:-mt-10 rounded-full flex items-center justify-center cursor-pointer z-10 ${isSelected ? 'ring-4 ring-amber-300/70 ring-offset-4 ring-offset-[#070709]' : ''}`}
            style={{
              left: node.x,
              top: node.y,
              background: `radial-gradient(circle at 30% 30%, ${color}ff 0%, ${color}aa 60%, ${color}55 100%)`,
              border: '2px solid rgba(255,255,255,0.2)',
              boxShadow: `inset -8px -8px 16px rgba(0,0,0,0.6), inset 8px 8px 16px rgba(255,255,255,0.3), 0 0 24px ${color}aa, 0 0 48px ${color}55`,
              transform: isSelected ? 'scale(1.15)' : 'scale(1)',
              transition: 'box-shadow 600ms, transform 300ms cubic-bezier(0.22,1,0.36,1)',
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
