import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SefiraSemanas, Metrics } from '../types';
import { SEFIRA_COLORS, ink } from '../../shared/tokens';

const W = 600;
const H = 320;
const PL = 38;
const PR = 12;
const PT = 14;
const PB = 28;

type Props = {
  data: SefiraSemanas;
  metrics: Metrics;
};

/**
 * Weekly drill-down for a single sefirá in a single month.
 *
 * - X axis: 4-5 weeks within the month.
 * - Actividades line: count per week (varies).
 * - Usuario / IA: rendered as flat horizontal reference lines at the
 *   month's average score, since those are aggregated per month (not
 *   per week) in the backend.
 */
export default function MesChart({ data, metrics }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const color = SEFIRA_COLORS[data.sefira_id] ?? '#a3a3a3';
  const activVals = useMemo(() => data.semanas.map(s => s.actividades), [data.semanas]);
  const activMax = useMemo(() => Math.max(1, ...activVals), [activVals]);
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;

  const xFor = (i: number) =>
    data.semanas.length === 1 ? PL + innerW / 2 : PL + (i / (data.semanas.length - 1)) * innerW;
  const yScore = (v: number) => PT + innerH - ((v - 1) / 9) * innerH;
  const yAct = (v: number) => PT + innerH - (v / activMax) * innerH;

  const gridScores = [1, 3, 5, 7, 9];

  // Build the activities polyline path
  const actPath = useMemo(() => {
    let path = '';
    activVals.forEach((v, i) => {
      const cmd = i === 0 ? 'M' : 'L';
      path += `${cmd}${xFor(i).toFixed(2)},${yAct(v).toFixed(2)} `;
    });
    return path.trim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activVals, activMax, data.semanas.length]);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const svgX = (px / rect.width) * W;
    const ratio = (svgX - PL) / innerW;
    const idx = Math.round(ratio * (data.semanas.length - 1));
    if (idx >= 0 && idx < data.semanas.length) setHoverIdx(idx);
  }
  function handleLeave() { setHoverIdx(null); }

  const tooltipPxX = hoverIdx !== null && svgRef.current
    ? (xFor(hoverIdx) / W) * svgRef.current.getBoundingClientRect().width
    : 0;

  const allEmpty = data.score_usuario === null && data.score_ia === null && activVals.every(v => v === 0);
  if (allEmpty) {
    return (
      <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-stone-400 text-sm font-serif italic text-center px-6">
            Aún sin reflexiones ni actividades este mes para esta dimensión.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full block"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {/* Y-axis gridlines (1..9 score scale on the left) */}
        {gridScores.map(t => (
          <g key={`yt-${t}`}>
            <line
              x1={PL} x2={W - PR}
              y1={yScore(t)} y2={yScore(t)}
              stroke="rgba(255,255,255,0.05)"
            />
            <text
              x={PL - 8} y={yScore(t)}
              textAnchor="end" dominantBaseline="central"
              fill="rgba(168,162,158,0.7)"
              style={{ fontSize: 10, fontFamily: 'monospace' }}
            >
              {t}
            </text>
          </g>
        ))}

        {/* X-axis baseline */}
        <line
          x1={PL} x2={W - PR}
          y1={H - PB} y2={H - PB}
          stroke="rgba(255,255,255,0.12)"
        />

        {/* X labels: S1 .. Sn */}
        {data.semanas.map((s, i) => (
          <text
            key={`xl-${i}`}
            x={xFor(i)} y={H - PB + 16}
            textAnchor="middle"
            fill="rgba(168,162,158,0.7)"
            style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.08em' }}
          >
            {s.label}
          </text>
        ))}

        {/* Flat reference lines for user / IA averages */}
        {metrics.usuario && data.score_usuario !== null && (
          <g>
            <motion.line
              x1={PL} x2={W - PR}
              y1={yScore(data.score_usuario)} y2={yScore(data.score_usuario)}
              stroke={color}
              strokeWidth={2.2}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
            <text
              x={W - PR - 4} y={yScore(data.score_usuario) - 4}
              textAnchor="end"
              fill={color}
              style={{ fontSize: 10, fontFamily: 'monospace' }}
            >
              {data.score_usuario.toFixed(1)} usuario
            </text>
          </g>
        )}
        {metrics.ia && data.score_ia !== null && (
          <g>
            <motion.line
              x1={PL} x2={W - PR}
              y1={yScore(data.score_ia)} y2={yScore(data.score_ia)}
              stroke={ink.ember}
              strokeWidth={2.2}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
            <text
              x={W - PR - 4} y={yScore(data.score_ia) - 4}
              textAnchor="end"
              fill={ink.ember}
              style={{ fontSize: 10, fontFamily: 'monospace' }}
            >
              {data.score_ia.toFixed(1)} ia
            </text>
          </g>
        )}

        {/* Actividades line (its own scale, mapped against the same chart height) */}
        {metrics.actividades && (
          <g>
            <motion.path
              d={actPath}
              fill="none"
              stroke="#86efac"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
            {activVals.map((v, i) => (
              <motion.circle
                key={`act-pt-${i}`}
                cx={xFor(i)}
                cy={yAct(v)}
                initial={{ r: 0, opacity: 0 }}
                animate={{ r: 3.5, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.4 + i * 0.04 }}
                fill="#86efac"
                stroke="#0e1014"
                strokeWidth={1.5}
              />
            ))}
          </g>
        )}

        {/* Hover guide line */}
        {hoverIdx !== null && (
          <line
            x1={xFor(hoverIdx)} x2={xFor(hoverIdx)}
            y1={PT} y2={H - PB}
            stroke="rgba(253,230,138,0.25)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
      </svg>

      <AnimatePresence>
        {hoverIdx !== null && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className="absolute top-2 pointer-events-none -translate-x-1/2 bg-[#0e1014]/95 border border-stone-700/50 rounded-lg px-3 py-2 shadow-xl"
            style={{ left: tooltipPxX }}
          >
            <div className="text-[10px] uppercase tracking-[0.14em] text-amber-100/80 mb-1">
              {data.semanas[hoverIdx].label} ·{' '}
              <span className="text-stone-400 normal-case tracking-normal">
                {fmtShort(data.semanas[hoverIdx].desde)} – {fmtShort(data.semanas[hoverIdx].hasta)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="text-emerald-300/90">
                <span className="text-stone-400">Actividades</span>{' '}
                {data.semanas[hoverIdx].actividades}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function fmtShort(iso: string): string {
  // "2025-09-08" → "08/09"
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
