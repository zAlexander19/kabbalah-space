type Props = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
};

export default function Sparkline({ values, width = 80, height = 20, color = '#e9c349' }: Props) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
    </svg>
  );
}
