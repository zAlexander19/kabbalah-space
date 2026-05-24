type Props = {
  size?: 'sm' | 'md';
};

/**
 * Wordmark del header: icono PNG (K-estrella blanca) + texto "Kabbalah ✦ Space".
 * El asset vive en `frontend/public/kabbalah-sapece-logo.png` (sic, typo del file
 * original) y se sirve desde `/kabbalah-sapece-logo.png` en runtime.
 */
export default function KabbalahLogo({ size = 'sm' }: Props) {
  const dim = size === 'sm' ? 32 : 44;
  const text = size === 'sm' ? 'text-base' : 'text-2xl';

  return (
    <span className="inline-flex items-center gap-3">
      <img
        src="/kabbalah-sapece-logo.png"
        alt="Kabbalah Space"
        width={dim}
        height={dim}
        className="shrink-0 object-contain"
        style={{ width: dim, height: dim }}
      />
      <span className={`ks-serif ${text} font-light tracking-tight whitespace-nowrap`}>
        <span className="text-ink-glow">Kabbalah</span>
        <span className="text-gold mx-1.5">✦</span>
        <span className="italic text-ink-glow">Space</span>
      </span>
    </span>
  );
}
