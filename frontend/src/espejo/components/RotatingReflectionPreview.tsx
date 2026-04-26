import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { SefiraResumen } from '../types';
import type { SefiraNode } from './SefirotInteractiveTree';
import { SEFIRA_COLORS } from '../../shared/tokens';
import { useReflectionRotation } from '../hooks/useReflectionRotation';

type Props = {
  sefirot: SefiraNode[];
  summary: SefiraResumen[];
  active: boolean;
  onSelectSefira: (id: string) => void;
};

function snippet(text: string, max = 100): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return `"${t}"`;
  return `"${t.slice(0, max - 1)}…"`;
}

function cardPosition(node: SefiraNode): React.CSSProperties {
  const xPct = (node.x / 400) * 100;
  const yPct = (node.y / 800) * 100;
  if (node.x < 160) {
    return { left: `calc(${xPct}% + 60px)`, top: `${yPct}%`, transform: 'translateY(-50%)' };
  }
  if (node.x > 240) {
    return { right: `calc(${100 - xPct}% + 60px)`, top: `${yPct}%`, transform: 'translateY(-50%)' };
  }
  if (node.y < 400) {
    return { left: `${xPct}%`, top: `calc(${yPct}% + 60px)`, transform: 'translateX(-50%)' };
  }
  return { left: `${xPct}%`, bottom: `calc(${100 - yPct}% + 60px)`, transform: 'translateX(-50%)' };
}

export default function RotatingReflectionPreview({ sefirot, summary, active, onSelectSefira }: Props) {
  const reduced = useReducedMotion();
  const { current, setHovered } = useReflectionRotation(summary, active && !reduced);

  if (!current) return null;
  const node = sefirot.find(s => s.id === current.sefira_id);
  if (!node) return null;
  const color = SEFIRA_COLORS[current.sefira_id] ?? '#eab308';
  const pos = cardPosition(node);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={current.sefira_id}
        initial={{ opacity: 0, scale: 0.94, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: [0, -2, 0, 2, 0] }}
        exit={{ opacity: 0, y: -6 }}
        transition={{
          opacity: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
          scale: { duration: 0.7 },
          y: { duration: 4, ease: 'easeInOut', repeat: Infinity },
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="absolute z-30 bg-[#0e1014]/95 backdrop-blur-md border rounded-xl shadow-xl px-3.5 py-3 w-[280px]"
        style={{
          ...pos,
          borderColor: `${color}55`,
          borderLeft: `2px solid ${color}`,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-[10px] uppercase tracking-wider text-stone-200">{current.sefira_nombre}</span>
          </div>
          <span className="text-[10px] tabular-nums px-2 py-0.5 rounded-full bg-amber-300/15 text-amber-200">
            {current.score_ia_promedio}
          </span>
        </div>
        <p className="text-xs text-stone-300/90 italic line-clamp-3 leading-snug mb-3">
          {snippet(current.ultima_reflexion_texto ?? '', 100)}
        </p>
        <button
          type="button"
          onClick={() => onSelectSefira(current.sefira_id)}
          className="text-[11px] text-amber-300/80 hover:text-amber-200 inline-flex items-center gap-1 transition-colors"
        >
          Ver más <span aria-hidden>→</span>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
