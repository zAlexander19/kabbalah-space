import { useEffect, useState } from 'react';
import {
  listUsuarios, setAdmin, setPremium, deleteUsuario, type UsuarioAdmin,
} from '../api';

export function UsuariosPanel() {
  const [items, setItems] = useState<UsuarioAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try { const r = await listUsuarios(search); setItems(r.items); setTotal(r.total); setError(null); }
    catch (e) { setError((e as Error).message); }
  };

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce de búsqueda
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try { await fn(); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div>
      {error && <p className="text-red-400/80 text-sm mb-4">{error}</p>}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre o email..."
        className="w-full bg-[#070709] border border-stone-800 rounded-xl p-3 text-stone-300 placeholder:text-stone-600 mb-4 focus:outline-none focus:border-amber-400/50"
      />
      <p className="text-stone-500 text-xs mb-3">{total} usuario(s)</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-stone-500 text-[10px] uppercase tracking-[0.16em] text-left border-b border-stone-800/60">
              <th className="py-2 pr-3">Nombre</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Proveedor</th>
              <th className="py-2 pr-3">Premium</th>
              <th className="py-2 pr-3">Admin</th>
              <th className="py-2 pr-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-b border-stone-800/30 text-stone-300">
                <td className="py-2.5 pr-3">{u.nombre}</td>
                <td className="py-2.5 pr-3 text-stone-400">{u.email}</td>
                <td className="py-2.5 pr-3 text-stone-400">{u.provider}</td>
                <td className="py-2.5 pr-3">{u.is_premium ? '★' : '—'}</td>
                <td className="py-2.5 pr-3">{u.is_admin ? '✓' : '—'}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex gap-2 items-center">
                    <button type="button" disabled={busy === u.id}
                      onClick={() => act(u.id, () => setPremium(u.id, !u.is_premium))}
                      className="text-[11px] text-amber-200/80 hover:text-amber-200 disabled:opacity-40">
                      {u.is_premium ? 'Quitar premium' : 'Dar premium'}
                    </button>
                    <button type="button" disabled={busy === u.id}
                      onClick={() => act(u.id, () => setAdmin(u.id, !u.is_admin))}
                      className="text-[11px] text-indigo-300/80 hover:text-indigo-300 disabled:opacity-40">
                      {u.is_admin ? 'Quitar admin' : 'Hacer admin'}
                    </button>
                    <button type="button" disabled={busy === u.id}
                      onClick={() => {
                        if (window.confirm(`¿Eliminar a ${u.email}? Esta acción es irreversible.`)) {
                          act(u.id, () => deleteUsuario(u.id));
                        }
                      }}
                      className="text-[11px] text-red-400/70 hover:text-red-400 disabled:opacity-40">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
