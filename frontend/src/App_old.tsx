import React, { useState } from "react";
const SEFIROT = [
  { id: "keter", name: "K�ter", left: "50%", top: "0%", colorClass: "border-2 border-primary-fixed/30 shadow-[0_0_20px_rgba(255,245,228,0.2)] bg-transparent", textClass: "text-primary-fixed-dim/60", description: "La Corona. La voluntad primigenia y el vac�o puro de donde todo emana." },
  { id: "jojma", name: "Jojm�", left: "90%", top: "120px", colorClass: "bg-white/90 shadow-lg", textClass: "text-stone-800", description: "La Sabidur�a. El destello inicial de inspiraci�n." },
  { id: "bina", name: "Bin�", left: "10%", top: "120px", colorClass: "bg-purple-600 shadow-lg", textClass: "text-white", description: "El Entendimiento. La vasija que da estructura." },
  { id: "jesed", name: "J�sed", left: "90%", top: "260px", colorClass: "bg-gradient-to-br from-white/80 to-slate-400 shadow-lg", textClass: "text-stone-800", description: "La Misericordia. Generosidad y amor incondicional." },
  { id: "gevura", name: "Guevur�", left: "10%", top: "260px", colorClass: "bg-gradient-to-br from-red-600 to-yellow-600 shadow-lg", textClass: "text-white", description: "La Severidad. Rigor y juicio." },
  { id: "tiferet", name: "Tif�ret", left: "50%", top: "330px", colorClass: "bg-gradient-to-br from-yellow-400 to-emerald-400/80 shadow-lg w-20 h-20 -ml-2 -mt-2", textClass: "text-stone-900", description: "La Belleza. Equilibrio entre Misericordia y Severidad." },
  { id: "netzaj", name: "N�tzaj", left: "90%", top: "400px", colorClass: "bg-pink-300 shadow-lg", textClass: "text-stone-800", description: "La Victoria. Perseverancia." },
  { id: "hod", name: "Hod", left: "10%", top: "400px", colorClass: "bg-pink-600 shadow-lg", textClass: "text-white", description: "El Esplendor. Intelectualidad pr�ctica." },
  { id: "yesod", name: "Yesod", left: "50%", top: "520px", colorClass: "bg-orange-500 shadow-lg", textClass: "text-white", description: "El Fundamento. La imaginaci�n y el motor ps�quico." },
  { id: "maljut", name: "Maljut", left: "50%", top: "100%", colorClass: "bg-blue-900 shadow-lg", textClass: "text-white", description: "El Reino. La acci�n f�sica y el mundo material." },
];

export default function App() {
  const [selectedSefira, setSelectedSefira] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aiScores, setAiScores] = useState<any>({});
  const [feedbacks, setFeedbacks] = useState<any>({});

  // Animaciones y mejoras visuales
  const glassEffect = "bg-stone-950/40 backdrop-blur-2xl border border-stone-800/60 shadow-[0_8px_32px_rgba(0,0,0,0.4)]";
  const glowText = "text-amber-100/90 text-shadow-sm";

  const handleSefiraClick = (sefira: any) => {
    setSelectedSefira(sefira);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!selectedSefira) return;
    const formData = new FormData(e.target);
    const score = formData.get('score');
    const text = formData.get('content');
    setIsLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sefira: selectedSefira.name, text, score: parseInt(score as string) })
      });
      const data = await response.json();
      setAiScores((prev: any) => ({ ...prev, [selectedSefira.id]: data.ai_score }));
      setFeedbacks((prev: any) => ({ ...prev, [selectedSefira.id]: data.feedback }));
    } catch (error) {
      console.error('Error in evaluation', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070709] text-stone-300 font-body flex relative overflow-hidden">
      
      {/* Dynamic Cosmic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-amber-900/10 rounded-full blur-[140px] mix-blend-screen opacity-50"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-[120px] mix-blend-screen opacity-50"></div>
        <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[1000px] h-[1000px] bg-emerald-900/5 rounded-full blur-[150px] mix-blend-screen"></div>
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgNDBoNDBWMEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDExLjV2NDBIMHYtNDB6IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20"></div>
      </div>

      {/* SideNavBar with Luxury Treatment */}
      <aside className={`fixed left-0 top-0 h-full w-72 border-r border-stone-800/40 z-40 hidden lg:flex flex-col p-6 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${glassEffect}`}>
        <div className="mt-6 mb-12 px-2">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-8 h-8 rounded-md bg-stone-900/80 border border-stone-700/50 flex items-center justify-center shrink-0 shadow-inner">
               <span className="material-symbols-outlined text-amber-200/90 text-sm">auto_awesome</span>
            </div>
            <h1 className={`text-2xl font-serif tracking-wide ${glowText}`}>Kabbalah Space</h1>
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

          <h3 className="text-[10px] font-mono text-stone-500 uppercase tracking-[0.2em] mb-4 px-2">Architecture</h3>
          
          <nav className="space-y-2">
            <a className="group flex items-center gap-4 bg-gradient-to-r from-stone-800/50 to-transparent text-amber-100/90 rounded-xl px-4 py-3.5 border-l-2 border-amber-400/50 hover:bg-stone-800/80 transition-all duration-300" href="#">
              <span className="material-symbols-outlined text-[20px] opacity-80 group-hover:opacity-100 group-hover:text-amber-300 transition-colors">account_tree</span>
              <span className="text-sm tracking-wide font-medium">Espejo Cognitivo</span>
            </a>
            {[
              { icon: 'calendar_month', text: 'Calendario Secreto' },
              { icon: 'cognition', text: 'Cerebro BI' },
              { icon: 'monitoring', text: 'Dashboard Visual' },
              { icon: 'translate', text: 'Tesauro Guemátrico' }
            ].map((item, idx) => (
              <a key={idx} className="group flex items-center gap-4 text-stone-400 px-4 py-3.5 rounded-xl hover:bg-stone-800/30 hover:text-stone-200 transition-all duration-300 cursor-pointer">
                <span className="material-symbols-outlined text-[20px] opacity-60 group-hover:opacity-100 transition-opacity">{item.icon}</span>
                <span className="text-sm tracking-wide">{item.text}</span>
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="lg:ml-72 flex-1 pt-16 relative flex flex-col items-center px-6 min-h-screen">
        <header className="w-full max-w-6xl mb-16 px-4 py-6 text-center lg:text-left animate-fade-in-up">
           <h2 className={`font-serif text-4xl md:text-5xl font-light tracking-tight mb-4 ${glowText}`}>Spiritual Topology</h2>
           <p className="text-stone-400 text-sm md:text-base font-light tracking-wide max-w-2xl leading-relaxed">
             Interactúa con las emanaciones divinas. Analiza tu resonancia en el Árbol de la Vida y recibe retroalimentación analítica de nuestro modelo integral.
           </p>
        </header>

        {/* Tree of Life Visualization Section */}
        <section className="w-full max-w-6xl flex flex-col md:flex-row items-center md:items-start justify-center gap-16 xl:gap-24 relative z-10 pb-20">
          
          <div className="relative flex flex-col items-center shrink-0 w-[300px] sm:w-[380px] select-none">
            <div className="relative w-full h-[650px] sm:h-[750px]">
              
              {/* Refined Connections (SVG) */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-25" viewBox="0 0 400 750" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lineGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#d6d3d1" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="#fef08a" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#d6d3d1" stopOpacity="0.2" />
                  </linearGradient>
                </defs>
                <style>
                  {`
                    .refined-path { fill: none; stroke: url(#lineGlow); stroke-width: 1.5; stroke-dasharray: 4, 4; }
                  `}
                </style>
                {/* Horizontal */}
                <line className="refined-path" x1="130" x2="270" y1="130" y2="130"></line>
                <line className="refined-path" x1="130" x2="270" y1="270" y2="270"></line>
                <line className="refined-path" x1="130" x2="270" y1="410" y2="410"></line>
                {/* Verticals */}
                <line className="refined-path" x1="200" x2="200" y1="50" y2="650"></line>
                <line className="refined-path" x1="130" x2="130" y1="130" y2="410"></line>
                <line className="refined-path" x1="270" x2="270" y1="130" y2="410"></line>
                {/* Diagonals */}
                <line className="refined-path" x1="200" x2="130" y1="50" y2="130"></line>
                <line className="refined-path" x1="200" x2="270" y1="50" y2="130"></line>
                
                <line className="refined-path" x1="130" x2="200" y1="130" y2="200"></line>
                <line className="refined-path" x1="270" x2="200" y1="130" y2="200"></line>
                
                <line className="refined-path" x1="200" x2="130" y1="200" y2="270"></line>
                <line className="refined-path" x1="200" x2="270" y1="200" y2="270"></line>
                
                <line className="refined-path" x1="130" x2="200" y1="270" y2="340"></line>
                <line className="refined-path" x1="270" x2="200" y1="270" y2="340"></line>
                
                <line className="refined-path" x1="200" x2="130" y1="340" y2="410"></line>
                <line className="refined-path" x1="200" x2="270" y1="340" y2="410"></line>
                
                <line className="refined-path" x1="130" x2="200" y1="410" y2="530"></line>
                <line className="refined-path" x1="270" x2="200" y1="410" y2="530"></line>
              </svg>
              
              {/* Elegant Sefirot Nodes */}
              {SEFIROT.map((sefira) => {
                const isActive = selectedSefira?.id === sefira.id;
                return (
                  <div key={sefira.id}
                    className={`absolute w-14 h-14 sm:w-16 sm:h-16 -ml-7 -mt-7 sm:-ml-8 sm:-mt-8 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500 ease-out group ${sefira.colorClass} hover:scale-110 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] ${isActive ? 'scale-110 ring-4 ring-white/20 ring-offset-4 ring-offset-[#070709]' : ''}`}
                    style={{ left: sefira.left, top: sefira.top }}
                    onClick={() => handleSefiraClick(sefira)}
                    title={sefira.name}
                  >
                    {/* Inner glowing core */}
                    <div className="absolute inset-2 rounded-full bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <span className={`text-[9px] sm:text-[10px] font-mono tracking-[0.15em] opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-1 group-hover:translate-y-0 drop-shadow-md ${sefira.textClass}`}>
                      {sefira.name.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Information & Instructions (Dynamic) */}
          <div className="w-full flex-1 max-w-md xl:max-w-lg mt-8 md:mt-24">
            <div className={`p-8 sm:p-10 rounded-3xl transition-all duration-700 ${glassEffect}`}>
              {selectedSefira ? (
                <div className="animate-fade-in text-center md:text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] uppercase font-mono tracking-widest mb-6">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    Emanación Activa
                  </div>
                  <h3 className={`text-4xl font-serif mb-4 tracking-tight ${glowText}`}>{selectedSefira.name}</h3>
                  <div className="h-px w-full max-w-[200px] bg-gradient-to-r from-stone-700 to-transparent mb-6 mx-auto md:mx-0"></div>
                  <p className="text-stone-300 text-[15px] leading-relaxed font-light mb-10">
                    {selectedSefira.description}
                  </p>
                  <button 
                    onClick={() => document.getElementById('eval-modal')?.scrollIntoView({behavior: 'smooth'})}
                    className="w-full sm:w-auto px-8 py-3.5 bg-stone-100 text-stone-950 hover:bg-white font-medium text-xs font-mono uppercase tracking-[0.15em] rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                  >
                    Iniciar Autoevaluación
                  </button>
                </div>
              ) : (
                <div className="text-center opacity-60 flex flex-col items-center py-12">
                  <span className="material-symbols-outlined text-5xl mb-6 font-light">touch_app</span>
                  <p className="text-stone-400 text-sm font-mono uppercase tracking-[0.15em] leading-relaxed">
                    Selecciona una emanación en el Árbol<br/>para explorar su sabiduría
                  </p>
                </div>
              )}
            </div>
          </div>
        </section></main></div>);}