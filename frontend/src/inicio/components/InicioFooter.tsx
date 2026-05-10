import KabbalahLogo from './KabbalahLogo';

export default function InicioFooter() {
  return (
    <footer className="py-12 px-6 border-t border-line">
      <div className="max-w-6xl mx-auto flex flex-col items-center gap-6 text-center">
        <KabbalahLogo size="sm" />
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <a href="#premisa" className="ks-eyebrow text-ink/60 hover:text-gold transition-colors">Manifiesto</a>
          <a href="#sefirot" className="ks-eyebrow text-ink/60 hover:text-gold transition-colors">Sefirot</a>
          <a
            href="https://github.com/zAlexander19/kabbalah-space"
            target="_blank"
            rel="noopener noreferrer"
            className="ks-eyebrow text-ink/60 hover:text-gold transition-colors"
          >
            GitHub ↗
          </a>
        </nav>
        <p className="ks-eyebrow text-ink/40">
          Kabbalah Space © 2026 · Hecho con <span className="text-gold">✦</span>
        </p>
      </div>
    </footer>
  );
}
