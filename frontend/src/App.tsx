import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AdminPanel from "./AdminPanel";
import CalendarModule from "./calendar";
import EspejoModule from "./espejo";
import EvolucionModule from "./evolucion";

const SEFIROT = [
  { id: "keter",   name: "Kéter",   x: 200, y: 80,  colorClass: "", textClass: "", description: "La Corona. La voluntad primigenia y el vacío puro de donde todo emana." },
  { id: "jojma",   name: "Jojmá",   x: 320, y: 180, colorClass: "", textClass: "", description: "La Sabiduría. El destello inicial de inspiración." },
  { id: "bina",    name: "Biná",    x: 80,  y: 180, colorClass: "", textClass: "", description: "El Entendimiento. La vasija que da estructura." },
  { id: "jesed",   name: "Jésed",   x: 320, y: 310, colorClass: "", textClass: "", description: "La Misericordia. Generosidad y amor incondicional." },
  { id: "gevura",  name: "Gueburá", x: 80,  y: 310, colorClass: "", textClass: "", description: "La Severidad. Rigor y juicio." },
  { id: "tiferet", name: "Tiféret", x: 200, y: 410, colorClass: "", textClass: "", description: "La Belleza. Equilibrio entre Misericordia y Severidad." },
  { id: "netzaj",  name: "Nétsaj",  x: 320, y: 530, colorClass: "", textClass: "", description: "La Victoria. Perseverancia." },
  { id: "hod",     name: "Hod",     x: 80,  y: 530, colorClass: "", textClass: "", description: "El Esplendor. Intelectualidad práctica." },
  { id: "yesod",   name: "Yesod",   x: 200, y: 630, colorClass: "", textClass: "", description: "El Fundamento. La imaginación y el motor psíquico." },
  { id: "maljut",  name: "Maljut",  x: 200, y: 750, colorClass: "", textClass: "", description: "El Reino. La acción física y el mundo material." },
];

type ViewKey = 'espejo' | 'admin' | 'calendario' | 'evolucion';

const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  espejo:     { title: 'Mi Árbol de la Vida',    subtitle: 'Reflexión guiada por las dimensiones del alma.' },
  evolucion:  { title: 'Mi Evolución',            subtitle: 'El movimiento mensual de cada dimensión del alma.' },
  calendario: { title: 'Calendario Cabalístico', subtitle: 'La organización es parte del camino de rectificación. Organiza tu semana y tus dimensiones.' },
  admin:      { title: 'Panel de Administrador', subtitle: 'Gestión de preguntas guía por sefirá.' },
};

const NAV_ITEMS = [
  { key: 'espejo' as ViewKey,     icon: 'account_tree',           label: 'Mi Árbol de la Vida' },
  { key: 'evolucion' as ViewKey,  icon: 'monitoring',              label: 'Mi Evolución' },
  { key: 'calendario' as ViewKey, icon: 'event_note',              label: 'Calendario Cabalístico' },
  { key: 'admin' as ViewKey,      icon: 'admin_panel_settings',    label: 'Panel de Administrador' },
];

const INTRO_FLAG = 'espejo-intro-done';

function shouldPlayIntro(): boolean {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return false;
  return window.sessionStorage.getItem(INTRO_FLAG) !== '1';
}

const ease = [0.16, 1, 0.3, 1] as const;

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>('espejo');
  const [pageRevealed, setPageRevealed] = useState<boolean>(() => !shouldPlayIntro());
  const [introPlaying, setIntroPlaying] = useState<boolean>(() => shouldPlayIntro());

  const handleIntroComplete = useCallback(() => {
    setIntroPlaying(false);
    setPageRevealed(true);
    if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
      window.sessionStorage.setItem(INTRO_FLAG, '1');
    }
  }, []);

  const glassEffect = "bg-stone-950/40 backdrop-blur-2xl border border-stone-800/60 shadow-[0_8px_32px_rgba(0,0,0,0.4)]";
  const glowText = "text-amber-100/90 text-shadow-sm";

  const current = VIEW_TITLES[activeView];

  return (
    <div className="min-h-screen bg-[#070709] text-stone-300 font-body relative overflow-hidden">
      {/* Background cosmic gradients */}
      <motion.div
        className="fixed inset-0 z-0 pointer-events-none"
        initial={{ opacity: pageRevealed ? 1 : 0 }}
        animate={{ opacity: pageRevealed ? 1 : 0 }}
        transition={{ duration: 0.8, delay: pageRevealed ? 0.1 : 0, ease }}
        style={{ willChange: 'opacity' }}
      >
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-amber-900/10 rounded-full blur-[140px] mix-blend-screen opacity-50"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-[120px] mix-blend-screen opacity-50"></div>
        <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[1000px] h-[1000px] bg-emerald-900/5 rounded-full blur-[150px] mix-blend-screen"></div>
      </motion.div>

      {/* Icon rail — always visible thin sidebar with avatar + nav icons */}
      <motion.aside
        initial={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -20 }}
        animate={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -20 }}
        transition={{ duration: 0.6, delay: pageRevealed ? 0.25 : 0, ease }}
        style={{ willChange: 'transform, opacity' }}
        className="fixed left-0 top-0 h-full w-14 z-30 hidden md:flex flex-col items-center py-5 gap-2 bg-stone-950/60 backdrop-blur-xl border-r border-stone-800/40"
      >
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full ring-1 ring-stone-700/60 bg-stone-800/80 flex items-center justify-center mb-3"
          title="Adept Voyager · Yesod"
        >
          <span className="material-symbols-outlined text-stone-300 text-[18px]">psychology_alt</span>
        </div>

        <div className="w-6 h-px bg-stone-800/60 mb-2" />

        {/* Nav icons */}
        {NAV_ITEMS.map(item => {
          const isActive = activeView === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveView(item.key)}
              className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                isActive
                  ? 'bg-amber-300/15 text-amber-200 shadow-[0_0_12px_rgba(233,195,73,0.2)]'
                  : 'text-stone-500 hover:text-amber-200 hover:bg-stone-800/40'
              }`}
              title={item.label}
              aria-label={item.label}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {isActive && (
                <motion.div
                  layoutId="active-rail-indicator"
                  className="absolute -left-[6px] top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-amber-300"
                  transition={{ type: 'spring', damping: 24, stiffness: 280 }}
                />
              )}
              {/* Tooltip on hover */}
              <span className="absolute left-full ml-3 px-2 py-1 rounded-md bg-stone-950/95 border border-stone-800/60 text-[10px] text-stone-200 whitespace-nowrap uppercase tracking-[0.14em] opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Logo at bottom */}
        <div className="mt-auto">
          <div
            className="w-8 h-8 rounded-md bg-stone-900/80 border border-stone-700/50 flex items-center justify-center shadow-inner"
            title="Kabbalah Space"
          >
            <span className="material-symbols-outlined text-amber-200/90 text-sm">auto_awesome</span>
          </div>
        </div>
      </motion.aside>

      <main className="md:pl-14 flex-1 pt-16 relative flex flex-col items-center px-6 min-h-screen mb-10 overflow-auto">
        <header className="w-full max-w-[1400px] 2xl:max-w-[1600px] mb-8 px-4 py-6 text-center overflow-hidden">
          <motion.h2
            initial={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -80 }}
            animate={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -80 }}
            transition={{ duration: 0.85, delay: pageRevealed ? 0.45 : 0, ease }}
            style={{ willChange: 'transform, opacity' }}
            className={`font-serif text-4xl md:text-5xl font-light tracking-tight mb-4 ${glowText}`}
          >
            {current.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -60 }}
            animate={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -60 }}
            transition={{ duration: 0.85, delay: pageRevealed ? 0.6 : 0, ease }}
            style={{ willChange: 'transform, opacity' }}
            className="text-stone-400 text-sm md:text-base font-light tracking-wide max-w-2xl mx-auto leading-relaxed"
          >
            {current.subtitle}
          </motion.p>
        </header>

        <section className="w-full max-w-[1400px] 2xl:max-w-[1600px] px-2 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease }}
            >
              {activeView === 'admin' && <AdminPanel sefirot={SEFIROT} glowText={glowText} />}
              {activeView === 'calendario' && <CalendarModule sefirot={SEFIROT as any} glowText={glowText} />}
              {activeView === 'evolucion' && <EvolucionModule />}
              {activeView === 'espejo' && (
                <EspejoModule
                  sefirot={SEFIROT}
                  glassEffect={glassEffect}
                  introPlaying={introPlaying}
                  pageRevealed={pageRevealed}
                  onIntroComplete={handleIntroComplete}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
