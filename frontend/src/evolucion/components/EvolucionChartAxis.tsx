type Props = {
  width: number;
  height: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
  monthLabels: string[];
};

const Y_TICKS = [1, 3, 5, 7, 9];

export default function EvolucionChartAxis({
  width, height, paddingLeft, paddingRight, paddingTop, paddingBottom, monthLabels,
}: Props) {
  const innerW = width - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;

  const xFor = (i: number) =>
    monthLabels.length === 1
      ? paddingLeft + innerW / 2
      : paddingLeft + (i / (monthLabels.length - 1)) * innerW;

  const yFor = (val: number) => paddingTop + innerH - ((val - 1) / 9) * innerH;

  const xLabelStep = monthLabels.length > 10 ? Math.ceil(monthLabels.length / 8) : 1;

  return (
    <g>
      {Y_TICKS.map(t => (
        <g key={`yt-${t}`}>
          <line
            x1={paddingLeft} x2={width - paddingRight}
            y1={yFor(t)} y2={yFor(t)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />
          <text
            x={paddingLeft - 8} y={yFor(t)}
            textAnchor="end"
            dominantBaseline="central"
            fill="rgba(168,162,158,0.7)"
            style={{ fontSize: 10, fontFamily: 'monospace' }}
          >
            {t}
          </text>
        </g>
      ))}

      {monthLabels.map((lbl, i) => {
        if (i % xLabelStep !== 0 && i !== monthLabels.length - 1) return null;
        return (
          <text
            key={`xl-${i}`}
            x={xFor(i)} y={height - paddingBottom + 16}
            textAnchor="middle"
            fill="rgba(168,162,158,0.7)"
            style={{ fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}
          >
            {lbl}
          </text>
        );
      })}

      <line
        x1={paddingLeft} x2={width - paddingRight}
        y1={height - paddingBottom} y2={height - paddingBottom}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1}
      />
    </g>
  );
}
