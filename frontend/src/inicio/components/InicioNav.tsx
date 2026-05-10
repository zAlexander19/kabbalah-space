import { useEffect, useState } from 'react';
import KabbalahLogo from './KabbalahLogo';
import { useAuth } from '../../auth';

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Fixed nav at the top of the landing. Backdrop-blur intensifies after
 * the user scrolls past 100px. Anonymous users see "Iniciar sesión" as
 * the CTA; authenticated users see "Entrar al Árbol" instead.
 */
export default function InicioNav({ onEnterEspejo }: Props) {
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
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-3 flex items-center justify-between">
        <KabbalahLogo size="sm" />

        <div className="hidden md:flex items-center gap-1">
          <a href="#premisa" className="ks-nav-link">Manifiesto</a>
          <a href="#sefirot" className="ks-nav-link">Sefirot</a>
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
              onClick={onEnterEspejo}
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
