import { SEFIRA_COLORS } from '../../shared/tokens';

type Props = {
  size?: 'sm' | 'md';
};

/**
 * Inline-SVG logo wordmark adapted for dark backgrounds. The original
 * `kabbalah-space-logo.svg` ships navy-on-light coloring that doesn't read
 * over `--color-bg-deep`; this component draws a simplified tree icon in
 * gold next to "Kabbalah ✦ Space" text using the Newsreader serif.
 *
 * The mini tree mirrors the proportions of SefirotInteractiveTree
 * (10 sefirot at known positions, 22 connections) but scaled to a tiny
 * 100×90 viewBox and rendered with gold strokes/fills.
 */
export default function KabbalahLogo({ size = 'sm' }: Props) {
  const dim = size === 'sm' ? 32 : 44;
  const text = size === 'sm' ? 'text-base' : 'text-2xl';

  // Sefirot positions normalised to 100×90 viewBox.
  const nodes = [
    { id: 'keter',   x: 50, y: 8 },
    { id: 'jojma',   x: 78, y: 22 },
    { id: 'bina',    x: 22, y: 22 },
    { id: 'jesed',   x: 78, y: 40 },
    { id: 'gevura',  x: 22, y: 40 },
    { id: 'tiferet', x: 50, y: 50 },
    { id: 'netzaj',  x: 78, y: 64 },
    { id: 'hod',     x: 22, y: 64 },
    { id: 'yesod',   x: 50, y: 74 },
    { id: 'maljut',  x: 50, y: 84 },
  ];
  const connections: [string, string][] = [
    ['keter', 'jojma'], ['keter', 'bina'], ['keter', 'tiferet'],
    ['jojma', 'bina'], ['jojma', 'tiferet'], ['bina', 'tiferet'],
    ['jojma', 'jesed'], ['bina', 'gevura'],
    ['jesed', 'gevura'], ['jesed', 'tiferet'], ['gevura', 'tiferet'],
    ['jesed', 'netzaj'], ['gevura', 'hod'],
    ['netzaj', 'tiferet'], ['hod', 'tiferet'], ['yesod', 'tiferet'],
    ['netzaj', 'hod'], ['netzaj', 'yesod'], ['hod', 'yesod'],
    ['netzaj', 'maljut'], ['hod', 'maljut'], ['yesod', 'maljut'],
  ];
  const find = (id: string) => nodes.find((n) => n.id === id)!;

  return (
    <span className="inline-flex items-center gap-3">
      <svg
        width={dim}
        height={dim * 0.9}
        viewBox="0 0 100 90"
        aria-hidden
        className="shrink-0"
      >
        {connections.map(([a, b]) => {
          const na = find(a);
          const nb = find(b);
          return (
            <line
              key={`${a}-${b}`}
              x1={na.x}
              y1={na.y}
              x2={nb.x}
              y2={nb.y}
              stroke="rgba(233,195,73,0.35)"
              strokeWidth={0.9}
            />
          );
        })}
        {nodes.map((n) => (
          <circle
            key={n.id}
            cx={n.x}
            cy={n.y}
            r={3.2}
            fill={SEFIRA_COLORS[n.id] ?? '#e9c349'}
            stroke="rgba(255,245,228,0.6)"
            strokeWidth={0.4}
          />
        ))}
      </svg>
      <span className={`ks-serif ${text} font-light tracking-tight whitespace-nowrap`}>
        <span className="text-ink-glow">Kabbalah</span>
        <span className="text-gold mx-1.5">✦</span>
        <span className="italic text-ink-glow">Space</span>
      </span>
    </span>
  );
}
