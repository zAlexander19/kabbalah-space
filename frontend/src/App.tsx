import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import AdminPanel from "./AdminPanel";
import CalendarModule from "./calendar";
import EspejoModule from "./espejo";

const SEFIROT = [
  { id: "keter",   name: "Kéter",   x: 200, y: 20,  colorClass: "", textClass: "", description: "La Corona. La voluntad primigenia y el vacío puro de donde todo emana." },
  { id: "jojma",   name: "Jojmá",   x: 320, y: 120, colorClass: "", textClass: "", description: "La Sabiduría. El destello inicial de inspiración." },
  { id: "bina",    name: "Biná",    x: 80,  y: 120, colorClass: "", textClass: "", description: "El Entendimiento. La vasija que da estructura." },
  { id: "jesed",   name: "Jésed",   x: 320, y: 250, colorClass: "", textClass: "", description: "La Misericordia. Generosidad y amor incondicional." },
  { id: "gevura",  name: "Gueburá", x: 80,  y: 250, colorClass: "", textClass: "", description: "La Severidad. Rigor y juicio." },
  { id: "tiferet", name: "Tiféret", x: 200, y: 350, colorClass: "", textClass: "", description: "La Belleza. Equilibrio entre Misericordia y Severidad." },
  { id: "netzaj",  name: "Nétsaj",  x: 320, y: 470, colorClass: "", textClass: "", description: "La Victoria. Perseverancia." },
  { id: "hod",     name: "Hod",     x: 80,  y: 470, colorClass: "", textClass: "", description: "El Esplendor. Intelectualidad práctica." },
  { id: "yesod",   name: "Yesod",   x: 200, y: 570, colorClass: "", textClass: "", description: "El Fundamento. La imaginación y el motor psíquico." },
  { id: "maljut",  name: "Maljut",  x: 200, y: 690, colorClass: "", textClass: "", description: "El Reino. La acción física y el mundo material." },
];

type ViewKey = 'espejo' | 'admin' | 'calendario';

const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  espejo:     { title: 'Mi Árbol de la Vida',    subtitle: 'Reflexión guiada por las dimensiones del alma.' },
  calendario: { title: 'Calendario Cabalístico', subtitle: 'La organización es parte del camino de rectificación. Organiza tu semana y tus dimensiones.' },
  admin:      { title: 'Panel de Administrador', subtitle: 'Gestión de preguntas guía por sefirá.' },
};

const NAV_ITEMS = [
  { key: 'espejo', icon: 'account_tree', label: 'Mi Árbol de la Vida' },
  { key: 'calendario', icon: 'event_note', label: 'Calendario Cabalístico' },
  { key: 'admin', icon: 'admin_panel_settings', label: 'Panel de Administrador' },
] as const;

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleIntroComplete = useCallback(() => {
    setIntroPlaying(false);
    setPageRevealed(true);
    if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
      window.sessionStorage.setItem(INTRO_FLAG, '1');
    }
  }, []);

  function handleNavSelect(key: ViewKey) {
    setActiveView(key);
    setSidebarOpen(false);
  }

  const glassEffect = "bg-stone-950/70 backdrop-blur-2xl border border-stone-800/60 shadow-[0_8px_32px_rgba(0,0,0,0.4)]";
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

      {/* Hamburger button — siempre visible (cuando la página está revelada) */}
      <motion.button
        type="button"
        onClick={() => setSidebarOpen(true)}
        initial={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -20 }}
        animate={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : -20 }}
        transition={{ duration: 0.5, delay: pageRevealed ? 0.25 : 0, ease }}
        className="fixed top-5 left-5 z-30 w-11 h-11 rounded-full bg-stone-900/70 border border-stone-700/60 backdrop-blur flex items-center justify-center text-stone-300 hover:bg-stone-800 transition-colors"
        style={{ willChange: 'transform, opacity' }}
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </motion.button>

      {/* Sidebar drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              key="sidebar-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-[#0a0a0c]/70 backdrop-blur-sm"
            />
            <motion.aside
              key="sidebar"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.35, ease }}
              style={{ willChange: 'transform' }}
              className={`fixed left-0 top-0 h-full w-72 z-50 flex flex-col p-6 ${glassEffect}`}
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-stone-900/80 border border-stone-700/50 flex items-center justify-center shrink-0 shadow-inner">
                    <span className="material-symbols-outlined text-amber-200/90 text-sm">auto_awesome</span>
                  </div>
                  <h1 className={`text-xl font-serif tracking-wide ${glowText}`}>Kabbalah Space</h1>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="w-8 h-8 rounded-full text-stone-400 hover:text-stone-200 hover:bg-stone-800/60 flex items-center justify-center transition-colors"
                  aria-label="Cerrar menú"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex items-center gap-4 mb-10 bg-stone-900/40 p-4 rounded-2xl border border-white/5">
                <div className="w-12 h-12 rounded-full ring-2 ring-stone-700/50 ring-offset-2 ring-offset-[#070709] bg-stone-800 flex items-center justify-center overflow-hidden">
                  <span className="material-symbols-outlined text-stone-400">psychology_alt</span>
                </div>
                <div>
                  <div className="font-serif text-stone-200 text-sm tracking-wide">Adept Voyager</div>
                  <div className="text-[10px] font-mono text-amber-500/70 uppercase tracking-widest mt-1 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-amber-500/70"></span> Level: Yesod
                  </div>
                </div>
              </div>

              <nav className="space-y-2">
                {NAV_ITEMS.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleNavSelect(item.key)}
                    className={`group flex items-center gap-4 w-full text-left ${activeView === item.key ? 'bg-gradient-to-r from-stone-800/50 to-transparent text-amber-100/90 border-amber-400/50' : 'text-stone-400 border-transparent hover:bg-stone-800/30'} rounded-xl px-4 py-3.5 border-l-2 transition-all duration-300 cursor-pointer`}
                  >
                    <span className="material-symbols-outlined text-[20px] opacity-80 group-hover:opacity-100 group-hover:text-amber-300 transition-colors">{item.icon}</span>
                    <span className="text-sm tracking-wide font-medium">{item.label}</span>
                  </button>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 pt-16 relative flex flex-col items-center px-6 min-h-screen mb-10 overflow-auto">
        <header className="w-full max-w-[1400px] 2xl:max-w-[1600px] mb-10 px-4 py-6 text-center overflow-hidden">
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
