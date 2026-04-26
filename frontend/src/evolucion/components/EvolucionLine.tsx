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
}: Props) {
  if (!visible) return null;

  const innerW = width - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;
  const xFor = (i: number) =>
    values.length === 1 ? paddingLeft + innerW / 2 : paddingLeft + (i / (values.length - 1)) * innerW;
  const yFor = (v: number) => paddingTop + innerH - ((v - 1) / 9) * innerH;

  const path = buildPath(values, xFor, yFor);

  return (
    <g>
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
