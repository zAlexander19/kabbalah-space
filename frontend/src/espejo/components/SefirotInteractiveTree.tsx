import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SefiraResumen } from '../types';
import { SEFIRA_COLORS } from '../../shared/tokens';

export type SefiraNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  description: string;
};

const CONNECTIONS: { n1: string; n2: string; label: string }[] = [
  { n1: 'keter', n2: 'jojma', label: 'א' }, { n1: 'keter', n2: 'bina', label: 'ב' },
  { n1: 'keter', n2: 'tiferet', label: 'ג' }, { n1: 'jojma', n2: 'bina', label: 'ד' },
  { n1: 'jojma', n2: 'tiferet', label: 'ה' }, { n1: 'bina', n2: 'tiferet', label: 'ז' },
  { n1: 'jojma', n2: 'jesed', label: 'ו' }, { n1: 'bina', n2: 'gevura', label: 'ח' },
  { n1: 'jesed', n2: 'netzaj', label: 'כ' }, { n1: 'gevura', n2: 'hod', label: 'מ' },
  { n1: 'jesed', n2: 'gevura', label: 'ט' }, { n1: 'netzaj', n2: 'hod', label: 'פ' },
  { n1: 'jesed', n2: 'tiferet', label: 'י' }, { n1: 'gevura', n2: 'tiferet', label: 'ל' },
  { n1: 'netzaj', n2: 'tiferet', label: 'נ' }, { n1: 'hod', n2: 'tiferet', label: 'ע' },
  { n1: 'yesod', n2: 'tiferet', label: 'ס' }, { n1: 'netzaj', n2: 'yesod', label: 'צ' },
  { n1: 'hod', n2: 'yesod', label: 'ר' }, { n1: 'netzaj', n2: 'maljut', label: 'ק' },
  { n1: 'hod', n2: 'maljut', label: 'ש' }, { n1: 'yesod', n2: 'maljut', label: 'ת' },
];

type Props = {
  sefirot: SefiraNode[];
  summary: SefiraResumen[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

type HoverState = { id: string } | null;

export default function SefirotInteractiveTree({ sefirot, summary, selectedId, onSelect }: Props) {
  const [hover, setHover] = useState<HoverState>(null);
  const summaryMap = useMemo(() => {
    const m: Record<string, SefiraResumen> = {};
    for (const s of summary) m[s.sefira_id] = s;
    return m;
  }, [summary]);

  function intensityOf(id: string): number {
    return summaryMap[id]?.intensidad ?? 0;
  }

  const hoveredNode = hover ? sefirot.find(s => s.id === hover.id) : null;
  const hoveredSummary = hover ? summaryMap[hover.id] : null;

  return (
    <div className="relative w-[400px] h-[800px] select-none">
      <svg viewBox="0 0 400 800" className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="treeLineGlow" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="400" y2="800">
            <stop offset="0%" stopColor="#d6d3d1" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#fef08a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#d6d3d1" stopOpacity="0.1" />
          </linearGradient>
          <filter id="treeNodeGlow" filterUnits="userSpaceOnUse" x="-100" y="-100" width="600" height="1000">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {CONNECTIONS.map((c, i) => {
          const a = sefirot.find(s => s.id === c.n1);
          const b = sefirot.find(s => s.id === c.n2);
          if (!a || !b) return null;
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="url(#treeLineGlow)" strokeWidth={4} strokeLinecap="round" />
              <rect x={midX - 12} y={midY - 12} width={24} height={24} fill="#070709" rx={12} opacity={0.85} />
              <text x={midX} y={midY} fill="#fef08a" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: 'David, serif', fontSize: 16, opacity: 0.9 }}>{c.label}</text>
            </g>
          );
        })}

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
            onMouseEnter={() => setHover({ id: node.id })}
            onMouseLeave={() => setHover(prev => (prev?.id === node.id ? null : prev))}
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
              left: hoveredNode.x,
              top: hoveredNode.y - 60,
              transform: 'translateX(-50%)',
              minWidth: 180,
            }}
          >
            <p className="text-[11px] font-semibold text-amber-100 uppercase tracking-wider">{hoveredNode.name}</p>
            <p className="text-[10px] text-stone-300/80 mt-1 leading-snug line-clamp-2">{hoveredNode.description}</p>
            <p className="text-[10px] text-amber-200/80 mt-1 tabular-nums">
              {hoveredSummary?.preguntas_disponibles ?? 0} disp ·{' '}
              {hoveredSummary?.score_ia_promedio !== null ? `IA ${hoveredSummary?.score_ia_promedio}` : 'sin score'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
