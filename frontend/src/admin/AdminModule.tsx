import { useState } from 'react';
import { PreguntasPanel } from './components/PreguntasPanel';
import { UsuariosPanel } from './components/UsuariosPanel';
import { StatsPanel } from './components/StatsPanel';

type Tab = 'stats' | 'preguntas' | 'usuarios';

const TABS: { key: Tab; label: string }[] = [
  { key: 'stats', label: 'Estadísticas' },
  { key: 'preguntas', label: 'Preguntas' },
  { key: 'usuarios', label: 'Usuarios' },
];

export default function AdminModule({ sefirot, glowText }: { sefirot: any[]; glowText: string }) {
  const [tab, setTab] = useState<Tab>('stats');
  return (
    <div className="w-full max-w-5xl mx-auto bg-stone-950/40 backdrop-blur-2xl border border-stone-800/60 rounded-2xl p-6 md:p-8 relative z-10">
      <div className="flex items-center gap-3 mb-6">
        <span className="material-symbols-outlined text-amber-300 text-3xl">admin_panel_settings</span>
        <h2 className={`font-serif text-2xl md:text-3xl tracking-tight ${glowText}`}>Panel de Administrador</h2>
      </div>

      <div className="flex gap-1 mb-8 border-b border-stone-800/60">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-xs uppercase tracking-[0.18em] transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'text-amber-200 border-amber-300/70'
                : 'text-stone-400 border-transparent hover:text-amber-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stats' && <StatsPanel />}
      {tab === 'preguntas' && <PreguntasPanel sefirot={sefirot} />}
      {tab === 'usuarios' && <UsuariosPanel />}
    </div>
  );
}
