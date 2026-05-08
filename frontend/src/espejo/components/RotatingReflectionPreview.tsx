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

const CARD_W = 280;
const CARD_H = 130; // estimate for vertical centering

function snippet(text: string, max = 110): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return `"${t}"`;
  return `"${t.slice(0, max - 1)}…"`;
}

function cardPosition(node: SefiraNode): { left: number; top: number } {
  const { x, y } = node;
  if (x < 160) {
    // sefirá izquierda → card a la izquierda
    return { left: x - 30 - CARD_W, top: y - CARD_H / 2 };
  }
  if (x > 240) {
    // sefirá derecha → card a la derecha
    return { left: x + 30, top: y - CARD_H / 2 };
  }
  // central
  if (y < 400) {
    return { left: x - CARD_W / 2, top: y + 30 };
  }
  return { left: x - CARD_W / 2, top: y - 30 - CARD_H };
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

  return (
    <motion.div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => e.stopPropagation()}
      initial={{ opacity: 0, left: pos.left, top: pos.top }}
      animate={{
        opacity: 1,
        left: pos.left,
        top: pos.top,
        borderColor: `${color}33`,
      }}
      transition={{
        opacity: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
        left: { duration: 0.85, ease: [0.16, 1, 0.3, 1] },
        top: { duration: 0.85, ease: [0.16, 1, 0.3, 1] },
        borderColor: { duration: 0.6, ease: 'easeInOut' },
      }}
      style={{
        position: 'absolute',
        zIndex: 30,
        width: CARD_W,
        borderWidth: 1,
        borderStyle: 'solid',
      }}
      className="bg-[#0e1014]/85 backdrop-blur-md rounded-lg shadow-md"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={current.sefira_id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="px-4 py-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-[11px] uppercase tracking-[0.14em] text-stone-200/95 font-medium">{current.sefira_nombre}</span>
            </div>
            {hasReflection && (
              <span className="text-[11px] tabular-nums px-2 py-0.5 rounded-full bg-amber-300/10 text-amber-200/85">
                {current.score_ia_promedio}
              </span>
            )}
          </div>

          {hasReflection ? (
            <p className="text-[13px] text-stone-300/90 italic line-clamp-3 leading-relaxed mb-2.5">
              {snippet(current.ultima_reflexion_texto ?? '', 110)}
            </p>
          ) : (
            <p className="text-[13px] text-stone-400/85 line-clamp-3 leading-relaxed mb-2.5">
              {node.description}
            </p>
          )}

          <button
            type="button"
            onClick={() => onSelectSefira(current.sefira_id)}
            className="text-[12px] text-amber-300/80 hover:text-amber-200 inline-flex items-center gap-1 transition-colors"
          >
            {hasReflection ? 'Ver más' : 'Reflexionar'} <span aria-hidden>→</span>
          </button>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
