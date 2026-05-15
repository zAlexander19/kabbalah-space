import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import KabbalahLogo from './KabbalahLogo';
import { useAuth } from '../../auth';

export type InicioNavTarget = 'inicio' | 'espejo' | 'calendario' | 'evolucion' | 'settings';

type Props = {
  onNavigate: (target: InicioNavTarget) => void;
  activeView?: InicioNavTarget;
};

const SECTIONS: { key: InicioNavTarget; label: string }[] = [
  { key: 'espejo',     label: 'Mi Árbol de la Vida' },
  { key: 'calendario', label: 'Calendario Cabalístico' },
  { key: 'evolucion',  label: 'Mi Evolución' },
];

const ease = [0.16, 1, 0.3, 1] as const;

function getInitials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function InicioNav({ onNavigate, activeView = 'inicio' }: Props) {
  const auth = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (auth.status !== 'authenticated') setMenuOpen(false);
  }, [auth.status]);

  const onLanding = activeView === 'inicio';
  const isAnon = auth.status === 'anonymous';
  // On the landing the chrome is intentionally transparent until scroll;
  // inside the app there is no "scroll past 100px" affordance, so keep the
  // solid backdrop visible from the start.
  const solidChrome = !onLanding || scrolled;

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        solidChrome
          ? 'backdrop-blur-md bg-bg-deep/80 border-b border-line'
          : 'backdrop-blur-sm bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-3 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate('inicio')}
          className="flex items-center rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/60"
          aria-label="Ir a la bienvenida"
        >
          <KabbalahLogo size="sm" />
        </button>

        <div className="hidden md:flex items-center gap-1">
          {SECTIONS.map((s) => {
            const active = activeView === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onNavigate(s.key)}
                className={`ks-nav-link ${active ? 'text-gold' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2" ref={menuRef}>
          {auth.status === 'loading' ? null : isAnon ? (
            <button
              type="button"
              onClick={() => auth.openLoginModal('manual')}
              className="ks-nav-cta"
            >
              Iniciar sesión <span aria-hidden>↗</span>
            </button>
          ) : auth.user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-stone-900/70 hover:bg-stone-900 border border-stone-800/70 hover:border-gold/30 transition-colors"
              >
                <Avatar nombre={auth.user.nombre} provider={auth.user.provider} />
                <span className="text-stone-200 text-xs tracking-wide max-w-[140px] truncate">
                  {auth.user.nombre}
                </span>
                <span
                  className={`material-symbols-outlined text-stone-500 text-[16px] transition-transform ${
                    menuOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                >
                  expand_more
                </span>
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    key="dropdown"
                    role="menu"
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.16, ease }}
                    className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl bg-stone-950/95 backdrop-blur-xl border border-stone-800/70 shadow-[0_16px_40px_rgba(0,0,0,0.55)] overflow-hidden"
                  >
                    <div className="px-4 pt-3.5 pb-3 flex items-start gap-3">
                      <Avatar nombre={auth.user.nombre} provider={auth.user.provider} large />
                      <div className="min-w-0 flex-1">
                        <p className="text-stone-100 text-sm font-medium truncate">{auth.user.nombre}</p>
                        <p className="text-stone-400 text-[11px] truncate">{auth.user.email}</p>
                        <p className="text-stone-500 text-[10px] uppercase tracking-[0.14em] mt-0.5">
                          via {auth.user.provider === 'google' ? 'Google' : 'Email'}
                        </p>
                      </div>
                    </div>

                    <div className="h-px bg-stone-800/70" />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('settings');
                      }}
                      className="w-full px-4 py-2.5 flex items-center gap-2 text-stone-300 hover:text-amber-200 hover:bg-stone-900/80 text-xs tracking-wide transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">settings</span>
                      Configuración
                    </button>
                    <div className="h-px bg-stone-800/70" />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        auth.logout();
                      }}
                      className="w-full px-4 py-2.5 flex items-center gap-2 text-stone-300 hover:text-amber-200 hover:bg-stone-900/80 text-xs tracking-wide transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">logout</span>
                      Cerrar sesión
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

type AvatarProps = {
  nombre: string;
  provider: 'email' | 'google';
  large?: boolean;
};

function Avatar({ nombre, provider, large }: AvatarProps) {
  const initials = getInitials(nombre);
  const ring = provider === 'google' ? 'ring-2 ring-gold/40' : 'ring-1 ring-stone-700';
  const sizeCls = large ? 'w-10 h-10 text-sm' : 'w-7 h-7 text-[11px]';
  return (
    <div
      aria-hidden="true"
      className={`shrink-0 ${sizeCls} ${ring} rounded-full bg-gradient-to-br from-stone-700 to-stone-800 text-amber-100 font-medium flex items-center justify-center select-none`}
    >
      {initials}
    </div>
  );
}
