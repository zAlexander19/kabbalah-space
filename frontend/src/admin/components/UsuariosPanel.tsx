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

  // Edición por fila
  const [editId, setEditId] = useState<string | null>(null);
  const [draftAdmin, setDraftAdmin] = useState(false);
  const [draftPremium, setDraftPremium] = useState(false);

  const load = async () => {
    try { const r = await listUsuarios(search); setItems(r.items); setTotal(r.total); setError(null); }
    catch (e) { setError((e as Error).message); }
  };

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce de búsqueda
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  const startEdit = (u: UsuarioAdmin) => {
    setError(null);
    setEditId(u.id);
    setDraftAdmin(u.is_admin);
    setDraftPremium(u.is_premium);
  };

  const cancelEdit = () => setEditId(null);

  const saveEdit = async (u: UsuarioAdmin) => {
    setBusy(u.id);
    try {
      // Aplicar solo lo que cambió. El backend valida los guards (p. ej. no
      // podés quitarte admin a vos mismo) y devuelve el error correspondiente.
      if (draftAdmin !== u.is_admin) await setAdmin(u.id, draftAdmin);
      if (draftPremium !== u.is_premium) await setPremium(u.id, draftPremium);
      setEditId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();        // re-sincronizar con la verdad del servidor
      setEditId(null);
    } finally {
      setBusy(null);
    }
  };

  const onDelete = (u: UsuarioAdmin) => {
    if (!window.confirm(`¿Eliminar a ${u.email}? Esta acción es irreversible.`)) return;
    setBusy(u.id);
    deleteUsuario(u.id)
      .then(load)
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(null));
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
            {items.map((u) => {
              const editing = editId === u.id;
              return (
                <tr key={u.id} className="border-b border-stone-800/30 text-stone-300">
                  <td className="py-2.5 pr-3">{u.nombre}</td>
                  <td className="py-2.5 pr-3 text-stone-400">{u.email}</td>
                  <td className="py-2.5 pr-3 text-stone-400">{u.provider}</td>

                  {/* Premium */}
                  <td className="py-2.5 pr-3">
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => setDraftPremium((v) => !v)}
                        className={`px-2 py-0.5 rounded-md text-[11px] border transition-colors ${
                          draftPremium
                            ? 'border-amber-400/50 text-amber-200 bg-amber-400/10'
                            : 'border-stone-700 text-stone-500 hover:text-stone-300'
                        }`}
                      >
                        {draftPremium ? '★ Premium' : '— Sin premium'}
                      </button>
                    ) : (
                      u.is_premium ? '★' : '—'
                    )}
                  </td>

                  {/* Admin */}
                  <td className="py-2.5 pr-3">
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => setDraftAdmin((v) => !v)}
                        className={`px-2 py-0.5 rounded-md text-[11px] border transition-colors ${
                          draftAdmin
                            ? 'border-indigo-400/50 text-indigo-200 bg-indigo-400/10'
                            : 'border-stone-700 text-stone-500 hover:text-stone-300'
                        }`}
                      >
                        {draftAdmin ? '✓ Admin' : '— No admin'}
                      </button>
                    ) : (
                      u.is_admin ? '✓' : '—'
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="py-2.5 pr-3">
                    {editing ? (
                      <div className="flex gap-3 items-center">
                        <button type="button" disabled={busy === u.id}
                          onClick={() => saveEdit(u)}
                          className="text-[11px] text-amber-200 hover:text-amber-100 disabled:opacity-40">
                          Guardar
                        </button>
                        <button type="button" disabled={busy === u.id}
                          onClick={cancelEdit}
                          className="text-[11px] text-stone-500 hover:text-stone-300 disabled:opacity-40">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <button type="button" disabled={busy === u.id}
                          onClick={() => startEdit(u)}
                          title="Editar roles" aria-label="Editar roles"
                          className="flex items-center justify-center w-9 h-9 text-stone-500 hover:text-amber-200 rounded-lg hover:bg-stone-800/50 disabled:opacity-40">
                          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
                        </button>
                        <button type="button" disabled={busy === u.id}
                          onClick={() => onDelete(u)}
                          title="Eliminar usuario" aria-label="Eliminar usuario"
                          className="flex items-center justify-center w-9 h-9 text-red-400/60 hover:text-red-400 rounded-lg hover:bg-red-400/10 disabled:opacity-40">
                          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
