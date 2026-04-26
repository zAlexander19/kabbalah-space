import { useEffect, useRef, useState } from 'react';
import type { SefiraNode, Activity } from '../types';
import { SEFIRA_COLORS, API_BASE } from '../tokens';
import RecurrencePicker from './RecurrencePicker';

type Scope = 'one' | 'series';

type Props = {
  sefirot: SefiraNode[];
  editing: Activity | null;
  initialDate?: Date;
  initialSlot?: { start: Date; end: Date } | null;
  scope?: Scope;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted?: () => void;
  onRequestDeleteScope?: () => void;
};

function ymd(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
function hm(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

export default function ActivityForm({
  sefirot, editing, initialDate, initialSlot, scope = 'one',
  onSaved, onCancel, onDeleted, onRequestDeleteScope,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => ymd(initialDate ?? new Date()));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [selected, setSelected] = useState<string[]>([]);
  const [rrule, setRrule] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<number | null>(null);

  useEffect(() => {
    if (editing) {
      const s = new Date(editing.inicio);
      const e = new Date(editing.fin);
      setTitle(editing.titulo);
      setDescription(editing.descripcion ?? '');
      setDate(ymd(s));
      setStartTime(hm(s));
      setEndTime(hm(e));
      setSelected(editing.sefirot.map(x => x.id));
      setRrule(editing.rrule ?? null);
    } else if (initialSlot) {
      setDate(ymd(initialSlot.start));
      setStartTime(hm(initialSlot.start));
      setEndTime(hm(initialSlot.end));
      setTitle('');
      setDescription('');
      setSelected([]);
      setRrule(null);
    } else if (initialDate) {
      setDate(ymd(initialDate));
    }
    setError('');
    setConfirmDelete(false);
  }, [editing, initialDate, initialSlot]);

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) {
      setError('Debes seleccionar al menos una sefirá');
      setShake(s => s + 1);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const startIso = new Date(`${date}T${startTime}:00`).toISOString();
      const endIso   = new Date(`${date}T${endTime}:00`).toISOString();
      const payload = {
        titulo: title,
        descripcion: description,
        inicio: startIso,
        fin: endIso,
        sefirot_ids: selected,
        rrule: rrule || undefined,
      };
      const url = editing
        ? `${API_BASE}/actividades/${editing.id}?scope=${scope}`
        : `${API_BASE}/actividades`;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'No se pudo guardar' }));
        setError(data.detail ?? 'No se pudo guardar');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteClick() {
    if (!editing) return;
    if (editing.serie_id && onRequestDeleteScope) {
      onRequestDeleteScope();
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    void doDelete();
  }

  async function doDelete() {
    if (!editing) return;
    const res = await fetch(`${API_BASE}/actividades/${editing.id}?scope=${scope}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('No se pudo eliminar');
      return;
    }
    onDeleted?.();
  }

  const inputBase = "w-full bg-transparent border-0 border-b border-stone-700/50 focus:border-b-2 focus:border-amber-300/70 focus:outline-none text-sm text-stone-100 px-0 py-2 transition-colors";

  const startDateForPicker = (() => {
    const [yy, mm, dd] = date.split('-').map(n => parseInt(n, 10));
    if (!yy || !mm || !dd) return new Date();
    return new Date(yy, mm - 1, dd);
  })();

  return (
    <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-6 space-y-6">
      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Título</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Ej. Meditación de Jésed" className={inputBase} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[0.4fr_0.6fr] gap-4">
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Fecha</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inputBase} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Horas</label>
          <div className="grid grid-cols-2 gap-3">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required className={inputBase} />
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required className={inputBase} />
          </div>
        </div>
      </div>

      <RecurrencePicker
        value={rrule}
        startDate={startDateForPicker}
        disabled={!!editing && scope === 'one' && !!editing.serie_id}
        onChange={setRrule}
      />

      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Descripción</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Intención y foco energético..." className="w-full min-h-[100px] resize-y bg-[#1b1f25] border border-stone-700/50 focus:border-amber-300/60 focus:outline-none text-sm text-stone-100 rounded-lg px-3 py-2 mt-2 transition-colors" />
      </div>

      <div className={shake ? 'cal-shake' : ''} key={shake}>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Sefirot</label>
        <div className="mt-3 flex flex-wrap gap-2">
          {sefirot.map(s => {
            const active = selected.includes(s.id);
            const color = SEFIRA_COLORS[s.id] ?? '#a3a3a3';
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider border transition active:scale-[1.08]"
                style={{
                  borderColor: active ? color : 'rgba(120,120,120,0.4)',
                  background: active ? `${color}26` : 'rgba(38,42,50,0.8)',
                  color: active ? '#f5f5f5' : '#b7bac1',
                  transitionDuration: '0.18s',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-red-400 text-xs cal-fade-in">{error}</p>}

      <div className="flex flex-col gap-3 pt-2">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-amber-300 text-stone-900 font-semibold text-xs uppercase tracking-[0.18em] py-3 hover:bg-amber-200 disabled:opacity-60 transition-colors"
          >
            {saving ? <LoadingDots /> : (editing ? 'Guardar cambios' : 'Crear actividad')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-stone-700 text-stone-300 text-xs uppercase tracking-[0.14em] px-4 hover:bg-stone-800/60 transition-colors"
          >
            Cancelar
          </button>
        </div>
        {editing && (
          <button
            type="button"
            onClick={handleDeleteClick}
            className={`w-full rounded-xl font-semibold text-[10px] uppercase tracking-[0.18em] py-3 border transition-colors ${
              confirmDelete
                ? 'bg-red-500 text-stone-900 border-red-500'
                : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
            }`}
          >
            {editing.serie_id ? 'Borrar actividad…' : (confirmDelete ? 'Click otra vez para confirmar' : 'Borrar actividad')}
          </button>
        )}
      </div>
    </form>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-stone-900 cal-loading-dot"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
