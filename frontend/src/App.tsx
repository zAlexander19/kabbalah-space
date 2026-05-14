import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import AdminPanel from "./AdminPanel";
import CalendarModule from "./calendar";
import EspejoModule from "./espejo";
import EvolucionModule from "./evolucion";
import InicioModule from "./inicio";
import InicioNav from "./inicio/components/InicioNav";

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

type ViewKey = 'inicio' | 'espejo' | 'admin' | 'calendario' | 'evolucion';

const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  inicio:     { title: 'Kabbalah Space',          subtitle: 'El conocimiento del universo empieza por adentro.' },
  espejo:     { title: 'Mi Árbol de la Vida',    subtitle: 'Reflexión guiada por las dimensiones del alma.' },
  evolucion:  { title: 'Mi Evolución',            subtitle: 'El movimiento mensual de cada dimensión del alma.' },
  calendario: { title: 'Calendario Cabalístico', subtitle: 'La organización es parte del camino de rectificación. Organiza tu semana y tus dimensiones.' },
  admin:      { title: 'Panel de Administrador', subtitle: 'Gestión de preguntas guía por sefirá.' },
};

const INTRO_FLAG = 'espejo-intro-done';

function shouldPlayIntro(): boolean {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return false;
  return window.sessionStorage.getItem(INTRO_FLAG) !== '1';
}

const ease = [0.16, 1, 0.3, 1] as const;

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>('inicio');
  const [pageRevealed, setPageRevealed] = useState<boolean>(() => !shouldPlayIntro());
  const [introPlaying, setIntroPlaying] = useState<boolean>(() => shouldPlayIntro());

  const handleIntroComplete = useCallback(() => {
    setIntroPlaying(false);
    setPageRevealed(true);
    if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
      window.sessionStorage.setItem(INTRO_FLAG, '1');
    }
  }, []);

  // If the user navigates away from Espejo while the intro is still playing,
  // EspejoIntro unmounts without ever calling onComplete — leaving introPlaying
  // stuck at `true`, which on the next return to Espejo hides the tree
  // (opacity 0) but doesn't render the intro either. Fast-forward the flag
  // here so coming back shows the tree directly.
  useEffect(() => {
    if (activeView !== 'espejo' && introPlaying) {
      handleIntroComplete();
    }
  }, [activeView, introPlaying, handleIntroComplete]);

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

      <InicioNav
        activeView={activeView === 'admin' ? 'inicio' : activeView}
        onNavigate={(target) => setActiveView(target)}
      />

      {activeView === 'inicio' ? (
        <InicioModule onNavigate={(target) => setActiveView(target)} />
      ) : (
        <main className="flex-1 pt-24 relative flex flex-col items-center px-6 min-h-screen mb-10 overflow-auto">
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

          <section className="w-full max-w-[1400px] 2xl:max-w-[1600px] px-2 relative" key={activeView}>
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
          </section>
        </main>
      )}
    </div>
  );
}
