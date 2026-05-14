import { useEffect, useState } from 'react';
import KabbalahLogo from './KabbalahLogo';
import { useAuth } from '../../auth';

export type InicioNavTarget = 'espejo' | 'calendario' | 'evolucion';

type Props = {
  onNavigate: (target: InicioNavTarget) => void;
};

const SECTIONS: { key: InicioNavTarget; label: string }[] = [
  { key: 'espejo',     label: 'Mi Árbol de la Vida' },
  { key: 'calendario', label: 'Calendario Cabalístico' },
  { key: 'evolucion',  label: 'Mi Evolución' },
];

/**
 * Fixed nav at the top of the landing. Backdrop-blur intensifies after
 * the user scrolls past 100px. Section links jump out of the landing
 * into the corresponding app view. Anonymous users see "Iniciar sesión"
 * as the CTA; authenticated users see "Entrar al Árbol" instead.
 */
export default function InicioNav({ onNavigate }: Props) {
  const auth = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isAnon = auth.status === 'anonymous';

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'backdrop-blur-md bg-bg-deep/80 border-b border-line'
          : 'backdrop-blur-sm bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-3 flex items-center justify-between gap-4">
        <KabbalahLogo size="sm" />

        <div className="hidden md:flex items-center gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onNavigate(s.key)}
              className="ks-nav-link"
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isAnon ? (
            <button
              type="button"
              onClick={() => auth.openLoginModal('manual')}
              className="ks-nav-cta"
            >
              Iniciar sesión <span aria-hidden>↗</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('espejo')}
              className="ks-nav-cta"
            >
              Entrar al Árbol <span aria-hidden>↗</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
