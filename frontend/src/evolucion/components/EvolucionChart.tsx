import { useState, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SefiraEvolucion, Metrics } from '../types';
import { SEFIRA_COLORS, ink } from '../../shared/tokens';
import EvolucionChartAxis from './EvolucionChartAxis';
import EvolucionLine from './EvolucionLine';
import EvolucionTooltip from './EvolucionTooltip';

const W = 600;
const H = 320;
const PL = 38;
const PR = 12;
const PT = 14;
const PB = 28;

type Props = {
  data: SefiraEvolucion;
  metrics: Metrics;
};

function shortMonthLabel(mesKey: string): string {
  const d = parse(`${mesKey}-01`, 'yyyy-MM-dd', new Date());
  return format(d, 'MMM', { locale: es }).toUpperCase();
}

export default function EvolucionChart({ data, metrics }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const color = SEFIRA_COLORS[data.sefira_id] ?? '#a3a3a3';
  const labels = useMemo(() => data.meses.map(m => shortMonthLabel(m.mes)), [data.meses]);
  const usuarioVals = useMemo(() => data.meses.map(m => m.score_usuario), [data.meses]);
  const iaVals = useMemo(() => data.meses.map(m => m.score_ia), [data.meses]);

  const innerW = W - PL - PR;
  const xFor = (i: number) =>
    data.meses.length === 1 ? PL + innerW / 2 : PL + (i / (data.meses.length - 1)) * innerW;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    // Convert pixel x to SVG x (rect.width corresponds to W in viewBox)
    const svgX = (px / rect.width) * W;
    const ratio = (svgX - PL) / innerW;
    const idx = Math.round(ratio * (data.meses.length - 1));
    if (idx >= 0 && idx < data.meses.length) setHoverIdx(idx);
  }

  function handleLeave() { setHoverIdx(null); }

  const allEmpty = usuarioVals.every(v => v === null) && iaVals.every(v => v === null);

  if (allEmpty) {
    return (
      <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-stone-400 text-sm font-serif italic text-center px-6">
            Aún sin reflexiones para esta dimensión en el rango elegido.
          </p>
        </div>
      </div>
    );
  }

  // Tooltip x in pixel coords (relative to the SVG container), converted from SVG x
  const tooltipPxX = hoverIdx !== null && svgRef.current
    ? (xFor(hoverIdx) / W) * svgRef.current.getBoundingClientRect().width
    : 0;

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full block"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        <EvolucionChartAxis
          width={W} height={H}
          paddingLeft={PL} paddingRight={PR} paddingTop={PT} paddingBottom={PB}
          monthLabels={labels}
        />
        <EvolucionLine
          values={usuarioVals}
          color={color}
          visible={metrics.usuario}
          width={W} height={H}
          paddingLeft={PL} paddingRight={PR} paddingTop={PT} paddingBottom={PB}
          layoutKey={`${data.sefira_id}-usuario`}
        />
        <EvolucionLine
          values={iaVals}
          color={ink.ember}
          visible={metrics.ia}
          width={W} height={H}
          paddingLeft={PL} paddingRight={PR} paddingTop={PT} paddingBottom={PB}
          layoutKey={`${data.sefira_id}-ia`}
        />

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
          <EvolucionTooltip
            bucket={data.meses[hoverIdx]}
            x={tooltipPxX}
            color={color}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
