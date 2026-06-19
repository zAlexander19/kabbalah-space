import { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import {
  listPreguntas, createPregunta, updatePregunta, deletePregunta, reorderPreguntas,
  type PreguntaAdmin,
} from '../api';

export function PreguntasPanel({ sefirot }: { sefirot: { id: string; name: string }[] }) {
  const [sefiraId, setSefiraId] = useState(sefirot[0]?.id ?? '');
  const [items, setItems] = useState<PreguntaAdmin[]>([]);
  const [nuevo, setNuevo] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Espejo del orden actual para persistir al soltar el drag (evita closure stale).
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const load = async () => {
    try { setItems(await listPreguntas(sefiraId)); setError(null); }
    catch (e) { setError((e as Error).message); }
  };

  useEffect(() => { if (sefiraId) load(); /* eslint-disable-next-line */ }, [sefiraId]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevo.trim()) return;
    try { await createPregunta(sefiraId, nuevo.trim()); setNuevo(''); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  const onSaveEdit = async (id: string) => {
    try { await updatePregunta(id, editTexto.trim()); setEditId(null); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('¿Borrar esta pregunta? Afecta a todos los usuarios.')) return;
    try { await deletePregunta(id); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  // Persistir el orden actual cuando el usuario suelta una pregunta arrastrada.
  const persistOrder = async () => {
    try { await reorderPreguntas(sefiraId, itemsRef.current.map((p) => p.id)); }
    catch (e) { setError((e as Error).message); await load(); }
  };

  return (
    <div>
      {error && <p className="text-red-400/80 text-sm mb-4">{error}</p>}

      <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-2">Sefirá</label>
      <select
        value={sefiraId}
        onChange={(e) => setSefiraId(e.target.value)}
        className="w-full bg-[#070709] border border-stone-800 rounded-xl p-3 text-stone-300 mb-6 focus:outline-none focus:border-amber-400/50"
      >
        {sefirot.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      {items.length === 0 ? (
        <p className="text-stone-500 italic text-sm mb-6">No hay preguntas para esta sefirá.</p>
      ) : (
        <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-3 mb-6">
          {items.map((p) => (
            <PreguntaRow
              key={p.id}
              p={p}
              editing={editId === p.id}
              editTexto={editTexto}
              setEditTexto={setEditTexto}
              onStartEdit={() => { setEditId(p.id); setEditTexto(p.texto_pregunta); }}
              onSaveEdit={() => onSaveEdit(p.id)}
              onCancelEdit={() => setEditId(null)}
              onDelete={() => onDelete(p.id)}
              onDragEnd={persistOrder}
            />
          ))}
        </Reorder.Group>
      )}

      <form onSubmit={onAdd} className="bg-[#070709]/50 p-5 rounded-xl border border-stone-800/30">
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-3">Nueva pregunta</label>
        <textarea value={nuevo} onChange={(e) => setNuevo(e.target.value)} required
          placeholder="Escribí una pregunta para la dimensión..."
          className="w-full bg-stone-900/30 border border-stone-800 rounded-xl p-4 text-stone-300 placeholder:text-stone-600 mb-4 min-h-[90px] focus:outline-none focus:border-amber-400/50" />
        <button type="submit"
          className="w-full bg-gradient-to-r from-amber-200 to-amber-400 text-stone-950 font-medium font-serif tracking-wide py-3 px-6 rounded-xl hover:-translate-y-0.5 transition-all">
          Guardar pregunta
        </button>
      </form>
    </div>
  );
}

type RowProps = {
  p: PreguntaAdmin;
  editing: boolean;
  editTexto: string;
  setEditTexto: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onDragEnd: () => void;
};

function PreguntaRow({
  p, editing, editTexto, setEditTexto, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onDragEnd,
}: RowProps) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={p}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.02, boxShadow: '0 12px 30px rgba(0,0,0,0.45)' }}
      className="flex items-start gap-3 bg-stone-900/70 p-4 rounded-xl border border-stone-800/30 list-none"
    >
      {/* Handle de arrastre — solo desde acá se inicia el drag */}
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        title="Arrastrar para reordenar"
        aria-label="Arrastrar para reordenar"
        className="cursor-grab active:cursor-grabbing touch-none select-none text-stone-500 hover:text-amber-200 pt-0.5"
      >
        <span className="material-symbols-outlined text-[20px]">drag_indicator</span>
      </button>

      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea value={editTexto} onChange={(e) => setEditTexto(e.target.value)}
              className="w-full bg-stone-900/30 border border-stone-800 rounded-lg p-2 text-stone-200 text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={onSaveEdit} className="text-amber-200 text-xs">Guardar</button>
              <button type="button" onClick={onCancelEdit} className="text-stone-500 text-xs">Cancelar</button>
            </div>
          </div>
        ) : (
          <span className="text-stone-300 text-sm font-light leading-relaxed">{p.texto_pregunta}</span>
        )}
      </div>

      {!editing && (
        <div className="flex gap-1 shrink-0">
          <button type="button" onClick={onStartEdit}
            className="text-stone-500 hover:text-amber-200 p-1.5 rounded-lg hover:bg-stone-800/50">
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button type="button" onClick={onDelete}
            className="text-red-400/60 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10">
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      )}
    </Reorder.Item>
  );
}
