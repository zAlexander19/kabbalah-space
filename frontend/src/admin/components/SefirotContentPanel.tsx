import { useEffect, useState } from 'react';
import { getSefirotContent, updateSefiraContent, type SefiraContentAdmin } from '../api';

export function SefirotContentPanel() {
  const [items, setItems] = useState<SefiraContentAdmin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    getSefirotContent().then(setItems).catch((e) => setError((e as Error).message));
  }, []);

  const patchLocal = (id: string, patch: Partial<SefiraContentAdmin>) =>
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const onSave = async (s: SefiraContentAdmin) => {
    if (busy) return;
    setBusy(s.id);
    setSaved(null);
    try {
      const updated = await updateSefiraContent(s.id, {
        esencia: s.esencia ?? '',
        palabras_clave: s.palabras_clave,
        que_observa: s.que_observa ?? '',
      });
      patchLocal(s.id, updated);
      setError(null);
      setSaved(s.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {error && <p className="text-red-400/80 text-sm mb-4">{error}</p>}
      <div className="space-y-6">
        {items.map((s) => (
          <div key={s.id} className="bg-stone-900/60 p-5 rounded-xl border border-stone-800/30">
            <h3 className="font-serif text-lg text-amber-100/90 mb-4">{s.nombre}</h3>

            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-2">Esencia</label>
            <textarea
              value={s.esencia ?? ''}
              onChange={(e) => patchLocal(s.id, { esencia: e.target.value })}
              className="w-full bg-stone-900/30 border border-stone-800 rounded-xl p-3 text-stone-300 mb-4 min-h-[80px] focus:outline-none focus:border-amber-400/50"
            />

            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-2">
              Palabras clave (separadas por comas)
            </label>
            <input
              type="text"
              value={s.palabras_clave.join(', ')}
              onChange={(e) =>
                patchLocal(s.id, {
                  palabras_clave: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                })
              }
              className="w-full bg-stone-900/30 border border-stone-800 rounded-xl p-3 text-stone-300 mb-4 focus:outline-none focus:border-amber-400/50"
            />

            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-2">Qué observar</label>
            <textarea
              value={s.que_observa ?? ''}
              onChange={(e) => patchLocal(s.id, { que_observa: e.target.value })}
              className="w-full bg-stone-900/30 border border-stone-800 rounded-xl p-3 text-stone-300 mb-4 min-h-[80px] focus:outline-none focus:border-amber-400/50"
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onSave(s)}
                disabled={busy === s.id}
                className="bg-gradient-to-r from-amber-200 to-amber-400 text-stone-950 font-medium font-serif tracking-wide py-2.5 px-6 rounded-xl hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-wait disabled:hover:translate-y-0"
              >
                {busy === s.id ? 'Guardando…' : 'Guardar'}
              </button>
              {saved === s.id && busy === null && (
                <span className="text-amber-200/80 text-xs">Guardado ✓</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
