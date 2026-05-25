import { useState } from 'react';

import { updateMe } from '../auth/api';
import { useAuth } from '../auth/AuthContext';

export function ProfileSection() {
  const auth = useAuth();
  const [editing, setEditing] = useState(false);
  const [nombreDraft, setNombreDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status !== 'authenticated' || !auth.user) return null;

  function startEdit() {
    setNombreDraft(auth.user!.nombre);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const next = nombreDraft.trim();
    if (!next) {
      setError('El nombre no puede estar vacío.');
      return;
    }
    if (next === auth.user!.nombre) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMe({ nombre: next });
      auth.updateUser({ nombre: updated.nombre });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-[#15181d] border border-stone-700/40 rounded-2xl p-6 space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-1">Perfil</p>
        <h3 className="font-serif text-xl text-amber-100/95">Tu información</h3>
      </div>

      <div className="space-y-4">
        {/* Nombre — editable */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2">
            Nombre
          </label>
          {editing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={nombreDraft}
                onChange={(e) => setNombreDraft(e.target.value)}
                maxLength={100}
                autoFocus
                disabled={saving}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save();
                  if (e.key === 'Escape') cancelEdit();
                }}
                className="w-full bg-[#0e1014] border border-stone-800/70 focus:border-amber-300/50 rounded-xl px-4 py-2.5 text-sm text-stone-100 outline-none transition-colors disabled:opacity-50"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-full bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/40 text-amber-100 text-xs tracking-wide transition-colors disabled:opacity-60 disabled:cursor-wait"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-full text-stone-400 hover:text-stone-200 text-xs tracking-wide transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-stone-100 text-base">{auth.user.nombre}</p>
              <button
                type="button"
                onClick={startEdit}
                className="text-xs tracking-wide text-stone-400 hover:text-amber-100 transition-colors"
              >
                Editar
              </button>
            </div>
          )}
        </div>

        {/* Email — readonly */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2">
            Email
          </label>
          <p className="text-stone-200 text-sm">{auth.user.email}</p>
          <p className="text-stone-500 text-[10px] mt-1">
            El email no se puede cambiar desde acá. Si necesitás actualizarlo, escribinos.
          </p>
        </div>

        {/* Provider — informativo */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2">
            Conectado vía
          </label>
          <p className="text-stone-300 text-sm">
            {auth.user.provider === 'google' ? 'Google' : 'Email + contraseña'}
          </p>
        </div>
      </div>

      {error && (
        <p className="text-red-300 text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
