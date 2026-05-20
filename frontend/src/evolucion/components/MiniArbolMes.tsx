import { motion } from 'framer-motion';
import { CONNECTIONS, SEFIRA_COLORS } from '../../shared/tokens';

/**
 * Compact Tree of Life rendered inside a circle, one per month in the
 * EvolucionTimeline. Each sefirá node's size + glow is driven by the
 * user's average score that month for that sefirá. The general monthly
 * average is shown as a big number at the center.
 */

// Tree node coordinates, normalized to a 100×100 viewBox so the SVG
// scales cleanly with the circle. Y-axis is taller than wide naturally;
// we use 100×100 but accept the tree compresses a bit vertically (it
// reads as a tree at this size; the verticality is signal enough).
const NODES: { id: string; x: number; y: number }[] = [
  { id: 'keter',   x: 50, y: 10 },
  { id: 'jojma',   x: 78, y: 22 },
  { id: 'bina',    x: 22, y: 22 },
  { id: 'jesed',   x: 78, y: 42 },
  { id: 'gevura',  x: 22, y: 42 },
  { id: 'tiferet', x: 50, y: 52 },
  { id: 'netzaj',  x: 78, y: 72 },
  { id: 'hod',     x: 22, y: 72 },
  { id: 'yesod',   x: 50, y: 82 },
  { id: 'maljut',  x: 50, y: 94 },
];

const POS: Record<string, { x: number; y: number }> = NODES.reduce(
  (acc, n) => ({ ...acc, [n.id]: { x: n.x, y: n.y } }),
  {},
);

type Props = {
  /** Map sefiraId → average user score for the month (1-10, or null). */
  scoresUsuario: Record<string, number | null>;
  /** Average across all sefirot for the month, or null if no data. */
  promedioGeneral: number | null;
  /** Outer circle diameter in pixels (chart-coord units / SVG units). */
  size: number;
  /** Highlight when the corresponding month is the currently-pinned one. */
  selected?: boolean;
  /** Fire when the user clicks the circle. */
  onClick?: () => void;
  /** ID for animation tracking by framer-motion. */
  layoutId?: string;
};

export default function MiniArbolMes({
  scoresUsuario, promedioGeneral, size, selected = false, onClick, layoutId,
}: Props) {
  const r = size / 2;
  const empty = promedioGeneral === null;

  // Map a score (1-10, null → 0.3 baseline) to a normalized 0..1 weight
  // that drives node size and opacity. Null scores show as faint dots.
  function weight(score: number | null): number {
    if (score === null || !Number.isFinite(score)) return 0.25;
    const clamped = Math.max(1, Math.min(10, score));
    return 0.3 + ((clamped - 1) / 9) * 0.7; // 0.3 .. 1.0
  }

  return (
    <motion.g
      layoutId={layoutId}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      whileHover={onClick ? { scale: 1.06 } : undefined}
      transition={{ type: 'spring', damping: 22, stiffness: 320 }}
    >
      {/* Outer circle: background + ring */}
      <circle
        r={r}
        fill={empty ? 'rgba(38, 42, 50, 0.4)' : 'rgba(20, 22, 27, 0.85)'}
        stroke={selected ? '#e9c349' : 'rgba(120, 113, 90, 0.35)'}
        strokeWidth={selected ? 1.5 : 0.8}
      />
      {selected && (
        <circle
          r={r + 2}
          fill="none"
          stroke="rgba(233, 195, 73, 0.25)"
          strokeWidth={2}
        />
      )}

      {/* Tree: scale 100×100 down to ~75% of circle diameter, centered. */}
      <g transform={`translate(-${r * 0.75},-${r * 0.75}) scale(${(r * 1.5) / 100})`}>
        {/* Connections — drawn first so nodes overlay them. */}
        {CONNECTIONS.map((c, i) => {
          const a = POS[c.n1];
          const b = POS[c.n2];
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="rgba(120, 113, 90, 0.2)"
              strokeWidth={0.4}
            />
          );
        })}

        {/* Nodes — sized by score weight. */}
        {NODES.map(n => {
          const score = scoresUsuario[n.id] ?? null;
          const w = weight(score);
          const radius = 2.2 + w * 3.2; // 2.2 .. 5.4 in tree coords
          const color = SEFIRA_COLORS[n.id] ?? '#a3a3a3';
          return (
            <g key={n.id}>
              {/* Outer glow ring scaled with weight */}
              {score !== null && (
                <circle
                  cx={n.x} cy={n.y}
                  r={radius + 1.8}
                  fill={color}
                  opacity={w * 0.18}
                />
              )}
              <circle
                cx={n.x} cy={n.y}
                r={radius}
                fill={color}
                opacity={0.35 + w * 0.65}
              />
            </g>
          );
        })}
      </g>

      {/* Promedio general — number floating ABOVE the circle so it
          doesn't overlap the tree below. */}
      <text
        x={0}
        y={-(r + 10)}
        textAnchor="middle"
        fill={empty ? 'rgba(255, 245, 228, 0.3)' : '#fff5e4'}
        fontFamily="Newsreader, serif"
        fontSize={r * 0.55}
        fontWeight={500}
        style={{ pointerEvents: 'none' }}
      >
        {empty ? '—' : promedioGeneral!.toFixed(1)}
      </text>
    </motion.g>
  );
}
