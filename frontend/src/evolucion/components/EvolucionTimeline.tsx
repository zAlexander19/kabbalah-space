import { useMemo } from 'react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SefiraEvolucion } from '../types';
import MiniArbolMes from './MiniArbolMes';

const W = 1100;
const H = 460;
const PL = 60;
const PR = 40;
const PT = 30;
const PB = 60;

type MonthlyAggregate = {
  mes: string;
  promedio: number | null;
  scoresPorSefira: Record<string, number | null>;
};

type Props = {
  data: SefiraEvolucion[];
  onMonthClick: (mes: string) => void;
};

function shortMonthLabel(mesKey: string): string {
  const d = parse(`${mesKey}-01`, 'yyyy-MM-dd', new Date());
  return format(d, 'MMM', { locale: es }).toUpperCase();
}

/**
 * Compute one row per month with the user-score average across all
 * sefirot, plus a per-sefirá score map used to render the mini-tree.
 *
 * Data shape from API: `SefiraEvolucion[]` — one entry per sefirá,
 * each with a `meses` array. We invert that into per-month aggregates.
 */
function aggregateByMonth(data: SefiraEvolucion[]): MonthlyAggregate[] {
  if (data.length === 0 || data[0].meses.length === 0) return [];
  const mesKeys = data[0].meses.map(m => m.mes);

  return mesKeys.map((mesKey, monthIdx) => {
    const scoresPorSefira: Record<string, number | null> = {};
    const validScores: number[] = [];
    for (const sef of data) {
      const bucket = sef.meses[monthIdx];
      const score = bucket?.score_usuario ?? null;
      scoresPorSefira[sef.sefira_id] = score;
      if (score !== null && Number.isFinite(score)) {
        validScores.push(score);
      }
    }
    const promedio = validScores.length === 0
      ? null
      : validScores.reduce((a, b) => a + b, 0) / validScores.length;
    return { mes: mesKey, promedio, scoresPorSefira };
  });
}

export default function EvolucionTimeline({ data, onMonthClick }: Props) {
  const months = useMemo(() => aggregateByMonth(data), [data]);

  if (months.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-stone-400 text-sm font-serif italic">
          Sin datos para mostrar todavía.
        </p>
      </div>
    );
  }

  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const n = months.length;

  // Circle sizing: leave at least 12px breathing room between centers,
  // capped at 80px diameter for the larger ranges (3M/6M).
  const spacing = n === 1 ? innerW : innerW / (n - 1);
  const circleSize = Math.min(80, Math.max(40, spacing * 0.78));

  const xFor = (i: number) =>
    n === 1 ? PL + innerW / 2 : PL + (i / (n - 1)) * innerW;
  const yFor = (v: number) => PT + innerH - ((v - 1) / 9) * innerH;

  // Build the line path connecting only points with a valid promedio.
  // Gaps are bridged visually so the line still flows across a missing
  // month (shown by the empty circle on top).
  const linePoints = months
    .map((m, i) => ({ x: xFor(i), y: m.promedio === null ? null : yFor(m.promedio) }))
    .filter((p): p is { x: number; y: number } => p.y !== null);

  const linePath = linePoints.length === 0
    ? ''
    : linePoints
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
        .join(' ');

  const gridScores = [1, 3, 5, 7, 9];

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        {/* Y axis gridlines + labels (1..9) */}
        {gridScores.map(s => {
          const y = yFor(s);
          return (
            <g key={s}>
              <line
                x1={PL} x2={W - PR} y1={y} y2={y}
                stroke="rgba(120,113,90,0.12)"
                strokeWidth={1}
              />
              <text
                x={PL - 10} y={y + 4}
                textAnchor="end"
                fill="rgba(168, 162, 158, 0.7)"
                fontSize={11}
                fontFamily="ui-sans-serif, system-ui"
              >
                {s}
              </text>
            </g>
          );
        })}

        {/* Connecting line (under the circles) */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="rgba(233, 195, 73, 0.55)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Mini-tree circles at each month */}
        {months.map((m, i) => {
          const x = xFor(i);
          const y = m.promedio === null ? PT + innerH - 10 : yFor(m.promedio);
          return (
            <g key={m.mes} transform={`translate(${x},${y})`}>
              <MiniArbolMes
                scoresUsuario={m.scoresPorSefira}
                promedioGeneral={m.promedio}
                size={circleSize}
                onClick={() => onMonthClick(m.mes)}
                layoutId={`mini-${m.mes}`}
              />
              <text
                x={0} y={circleSize / 2 + 22}
                textAnchor="middle"
                fill="rgba(168, 162, 158, 0.85)"
                fontSize={11}
                fontFamily="ui-sans-serif, system-ui"
                letterSpacing="0.12em"
              >
                {shortMonthLabel(m.mes)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
