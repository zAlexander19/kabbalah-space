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

function snippet(text: string, max = 90): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return `"${t}"`;
  return `"${t.slice(0, max - 1)}…"`;
}

function cardPosition(node: SefiraNode): React.CSSProperties {
  const xPct = (node.x / 400) * 100;
  const yPct = (node.y / 800) * 100;
  if (node.x < 160) {
    // sefirá a la izquierda → card a la izquierda del orbe (afuera del árbol)
    return { right: `calc(${100 - xPct}% + 56px)`, top: `${yPct}%`, transform: 'translateY(-50%)' };
  }
  if (node.x > 240) {
    // sefirá a la derecha → card a la derecha del orbe (afuera del árbol)
    return { left: `calc(${xPct}% + 56px)`, top: `${yPct}%`, transform: 'translateY(-50%)' };
  }
  // sefirá centrada → arriba o abajo según altura
  if (node.y < 400) {
    return { left: `${xPct}%`, top: `calc(${yPct}% + 56px)`, transform: 'translateX(-50%)' };
  }
  return { left: `${xPct}%`, bottom: `calc(${100 - yPct}% + 56px)`, transform: 'translateX(-50%)' };
}

export default function RotatingReflectionPreview({ sefirot, summary, active, onSelectSefira }: Props) {
  const reduced = useReducedMotion();
  const { current, setHovered } = useReflectionRotation(summary, active && !reduced);

  if (!current) return null;
  const node = sefirot.find(s => s.id === current.sefira_id);
  if (!node) return null;
  const color = SEFIRA_COLORS[current.sefira_id] ?? '#eab308';
  const pos = cardPosition(node);
  const hasReflection = current.score_ia_promedio !== null && !!current.ultima_reflexion_texto;
  const description = node.description;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={current.sefira_id}
        initial={{ opacity: 0, scale: 0.96, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: [0, -1.5, 0, 1.5, 0] }}
        exit={{ opacity: 0, y: -4 }}
        transition={{
          opacity: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
          scale: { duration: 0.7 },
          y: { duration: 4, ease: 'easeInOut', repeat: Infinity },
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => e.stopPropagation()}
        className="absolute z-30 bg-[#0e1014]/85 backdrop-blur-md rounded-lg shadow-md px-3 py-2.5 w-[220px]"
        style={{
          ...pos,
          border: `1px solid ${color}22`,
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            <span className="text-[9px] uppercase tracking-[0.14em] text-stone-300/90">{current.sefira_nombre}</span>
          </div>
          {hasReflection && (
            <span className="text-[9px] tabular-nums px-1.5 py-0.5 rounded-full bg-amber-300/10 text-amber-200/80">
              {current.score_ia_promedio}
            </span>
          )}
        </div>

        {hasReflection ? (
          <p className="text-[11px] text-stone-300/85 italic line-clamp-3 leading-snug mb-2">
            {snippet(current.ultima_reflexion_texto ?? '', 90)}
          </p>
        ) : (
          <p className="text-[11px] text-stone-400/75 line-clamp-3 leading-snug mb-2">
            {description}
          </p>
        )}

        <button
          type="button"
          onClick={() => onSelectSefira(current.sefira_id)}
          className="text-[10px] text-amber-300/70 hover:text-amber-200 inline-flex items-center gap-1 transition-colors"
        >
          {hasReflection ? 'Ver más' : 'Reflexionar'} <span aria-hidden>→</span>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
