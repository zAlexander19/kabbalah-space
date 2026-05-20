import { motion } from 'framer-motion';

type Props = {
  values: (number | null)[];
  color: string;
  visible: boolean;
  width: number;
  height: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
  layoutKey: string;
  /** Min value mapped to the chart's BOTTOM edge. Defaults to 1 (score scale). */
  scaleMin?: number;
  /** Max value mapped to the chart's TOP edge. Defaults to 10 (score scale). */
  scaleMax?: number;
  /** SVG dash array for the stroke. Omit for solid. */
  strokeDash?: string;
};

function buildPath(values: (number | null)[], xFor: (i: number) => number, yFor: (v: number) => number): string {
  let path = '';
  let pen: 'up' | 'down' = 'up';
  values.forEach((v, i) => {
    if (v === null) { pen = 'up'; return; }
    const x = xFor(i);
    const y = yFor(v);
    path += pen === 'up' ? `M${x.toFixed(2)},${y.toFixed(2)} ` : `L${x.toFixed(2)},${y.toFixed(2)} `;
    pen = 'down';
  });
  return path.trim();
}

export default function EvolucionLine({
  values, color, visible, width, height,
  paddingLeft, paddingRight, paddingTop, paddingBottom, layoutKey,
  scaleMin = 1, scaleMax = 10, strokeDash,
}: Props) {
  if (!visible) return null;

  const innerW = width - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;
  const xFor = (i: number) =>
    values.length === 1 ? paddingLeft + innerW / 2 : paddingLeft + (i / (values.length - 1)) * innerW;
  const range = Math.max(1e-6, scaleMax - scaleMin);
  const yFor = (v: number) => paddingTop + innerH - ((v - scaleMin) / range) * innerH;

  const path = buildPath(values, xFor, yFor);

  // framer-motion's pathLength animation hijacks strokeDasharray under the
  // hood — so if the caller asked for a dashed line we can't ALSO animate
  // the draw. Fall back to a plain opacity fade-in for dashed strokes.
  const isDashed = !!strokeDash;

  return (
    <g>
      {isDashed ? (
        <motion.path
          key={layoutKey + '-path'}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={strokeDash}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      ) : (
        <motion.path
          key={layoutKey + '-path'}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
            opacity:    { duration: 0.2 },
          }}
        />
      )}
      {values.map((v, i) => {
        if (v === null) return null;
        return (
          <motion.circle
            key={`${layoutKey}-pt-${i}`}
            cx={xFor(i)}
            cy={yFor(v)}
            initial={{ r: 0, opacity: 0 }}
            animate={{ r: 3.5, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.6 + i * 0.02 }}
            fill={color}
            stroke="#0e1014"
            strokeWidth={1.5}
          />
        );
      })}
    </g>
  );
}
