import { useMemo } from 'react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SefiraEvolucion } from '../types';
import MiniArbolMes from './MiniArbolMes';

const W = 1100;
const H = 500;
const PL = 60;
const PR = 40;
// Extra top padding so the promedio number (rendered above each
// circle in MiniArbolMes) doesn't get clipped when a month sits near
// the top of the chart.
const PT = 70;
const PB = 60;
// Horizontal inset for the circles, so the leftmost sphere doesn't
// overlap the Y-axis labels (which live at x ≈ PL-10) and the rightmost
// doesn't escape past the chart's right edge.
const CIRCLE_INSET = 60;

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

  // Circle row width: the inset shrinks the area where circle centers
  // can sit, leaving room on both sides so they never overlap the
  // Y-axis labels or the right edge.
  const circleRowW = innerW - 2 * CIRCLE_INSET;
  const spacing = n === 1 ? circleRowW : circleRowW / (n - 1);
  const circleSize = Math.min(80, Math.max(40, spacing * 0.78));

  const xFor = (i: number) =>
    n === 1
      ? PL + innerW / 2
      : PL + CIRCLE_INSET + (i / (n - 1)) * circleRowW;
  const yFor = (v: number) => PT + innerH - ((v - 1) / 9) * innerH;

  // Build the line by drawing one segment per pair of consecutive valid
  // months. Each segment starts at the EDGE of the source circle and ends
  // at the EDGE of the destination circle, so the line visually connects
  // the spheres instead of passing behind them.
  const linePoints = months
    .map((m, i) => ({ x: xFor(i), y: m.promedio === null ? null : yFor(m.promedio) }))
    .filter((p): p is { x: number; y: number } => p.y !== null);

  const r = circleSize / 2;
  const linePath = (() => {
    if (linePoints.length < 2) return '';
    const segments: string[] = [];
    for (let i = 0; i < linePoints.length - 1; i++) {
      const a = linePoints[i];
      const b = linePoints[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      // Circles overlap or touch — skip the segment, it would be a stub
      // or render inside the circles.
      if (len <= 2 * r) continue;
      const nx = dx / len;
      const ny = dy / len;
      const x1 = a.x + r * nx;
      const y1 = a.y + r * ny;
      const x2 = b.x - r * nx;
      const y2 = b.y - r * ny;
      segments.push(`M${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)}`);
    }
    return segments.join(' ');
  })();

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

        {/* Mini-tree circles at each month — y follows the promedio so
            the circle sits on the line. */}
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
            </g>
          );
        })}

        {/* X-axis: month labels in a fixed row at the chart's bottom edge,
            not under each circle (circles float at varying Y depending on
            the score). */}
        {months.map((m, i) => (
          <text
            key={`xlabel-${m.mes}`}
            x={xFor(i)}
            y={H - PB / 2 + 4}
            textAnchor="middle"
            fill="rgba(168, 162, 158, 0.85)"
            fontSize={11}
            fontFamily="ui-sans-serif, system-ui"
            letterSpacing="0.12em"
          >
            {shortMonthLabel(m.mes)}
          </text>
        ))}
      </svg>
    </div>
  );
}
