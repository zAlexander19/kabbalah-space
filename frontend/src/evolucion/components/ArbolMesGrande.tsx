import { motion } from 'framer-motion';
import { CONNECTIONS, SEFIRA_COLORS } from '../../shared/tokens';

/**
 * Big Tree of Life for a specific month. Each sefirá node is sized and
 * glowed by the value of the currently-selected metric (usuario / IA /
 * actividades). The label next to each node shows the actual value.
 *
 * Click on any node → drill down to the per-sefirá detailed chart.
 */

// Classical layout in a 400×800 viewBox (matches App.tsx SEFIROT and
// Mi Árbol's existing positioning so the shape reads as the same tree).
const NODES: { id: string; x: number; y: number; labelSide: 'left' | 'right' }[] = [
  { id: 'keter',   x: 200, y: 60,  labelSide: 'right' },
  { id: 'jojma',   x: 320, y: 160, labelSide: 'right' },
  { id: 'bina',    x: 80,  y: 160, labelSide: 'left'  },
  { id: 'jesed',   x: 320, y: 300, labelSide: 'right' },
  { id: 'gevura',  x: 80,  y: 300, labelSide: 'left'  },
  { id: 'tiferet', x: 200, y: 400, labelSide: 'right' },
  { id: 'netzaj',  x: 320, y: 530, labelSide: 'right' },
  { id: 'hod',     x: 80,  y: 530, labelSide: 'left'  },
  { id: 'yesod',   x: 200, y: 650, labelSide: 'right' },
  { id: 'maljut',  x: 200, y: 770, labelSide: 'right' },
];

const POS: Record<string, { x: number; y: number }> = NODES.reduce(
  (acc, n) => ({ ...acc, [n.id]: { x: n.x, y: n.y } }),
  {},
);

type MonthSnapshot = {
  sefira_id: string;
  sefira_nombre: string;
  score_usuario: number | null;
  score_ia: number | null;
  actividades: number;
};

export type MesMetric = 'usuario' | 'ia' | 'actividades';

type Props = {
  snapshot: MonthSnapshot[];
  metric: MesMetric;
  onSefiraClick: (sefiraId: string) => void;
};

export default function ArbolMesGrande({ snapshot, metric, onSefiraClick }: Props) {
  const byId = new Map(snapshot.map(s => [s.sefira_id, s]));
  const maxAct = Math.max(1, ...snapshot.map(s => s.actividades));

  function valueFor(s: MonthSnapshot | undefined): number | null {
    if (!s) return null;
    if (metric === 'usuario') return s.score_usuario;
    if (metric === 'ia') return s.score_ia;
    return s.actividades;
  }

  function weight(s: MonthSnapshot | undefined): number {
    const v = valueFor(s);
    if (v === null || !Number.isFinite(v)) return 0.2;
    if (metric === 'actividades') {
      return 0.3 + (v / maxAct) * 0.7;
    }
    const clamped = Math.max(1, Math.min(10, v));
    return 0.3 + ((clamped - 1) / 9) * 0.7;
  }

  function valueLabel(s: MonthSnapshot | undefined): string {
    const v = valueFor(s);
    if (v === null || !Number.isFinite(v)) return '—';
    if (metric === 'actividades') return String(v);
    return (v as number).toFixed(1);
  }

  return (
    <div className="w-full flex items-center justify-center">
      <svg viewBox="0 0 400 850" className="w-full h-auto block" style={{ maxWidth: 460 }}>
        {/* Connections — drawn first so nodes overlay them. */}
        {CONNECTIONS.map((c, i) => {
          const a = POS[c.n1];
          const b = POS[c.n2];
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="rgba(120, 113, 90, 0.25)"
              strokeWidth={1}
            />
          );
        })}

        {NODES.map(n => {
          const s = byId.get(n.id);
          const w = weight(s);
          const color = SEFIRA_COLORS[n.id] ?? '#a3a3a3';
          const radius = 14 + w * 22; // 14..36
          const labelX = n.labelSide === 'right' ? n.x + radius + 10 : n.x - radius - 10;
          const labelAnchor = n.labelSide === 'right' ? 'start' : 'end';
          return (
            <motion.g
              key={n.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onSefiraClick(n.id)}
              whileHover={{ scale: 1.06 }}
              transition={{ type: 'spring', damping: 22, stiffness: 320 }}
              transform={`translate(${n.x},${n.y})`}
            >
              {/* Outer glow */}
              <circle
                r={radius + 6}
                fill={color}
                opacity={w * 0.18}
              />
              {/* Main node */}
              <circle
                r={radius}
                fill={color}
                opacity={0.45 + w * 0.55}
                stroke="rgba(255, 245, 228, 0.15)"
                strokeWidth={1}
              />

              {/* Label group, positioned to the side of the node */}
              <text
                x={labelX - n.x}
                y={-4}
                textAnchor={labelAnchor}
                fill="rgba(168, 162, 158, 0.95)"
                fontSize={12}
                fontFamily="ui-sans-serif, system-ui"
                letterSpacing="0.08em"
                style={{ textTransform: 'uppercase' }}
              >
                {s?.sefira_nombre ?? n.id}
              </text>
              <text
                x={labelX - n.x}
                y={14}
                textAnchor={labelAnchor}
                fill="#fff5e4"
                fontFamily="Newsreader, serif"
                fontSize={18}
                fontWeight={500}
              >
                {valueLabel(s)}
              </text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
