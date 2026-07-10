import { useMemo, useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import {
  type ByDay, type Freq,
  buildRRule, parseRRule, describeRRule, WEEKDAY_FROM_DATE, DAY_LABELS,
} from '../utils/rrule';

type Props = {
  value: string | null;
  startDate: Date;
  disabled?: boolean;
  onChange: (rrule: string | null) => void;
  /** When true, all options except "No se repite" are tagged "(premium)"
   *  in their label, signaling to free users that picking them is gated. */
  markPremium?: boolean;
};

type EndsKind = 'never' | 'on' | 'after';

const DAYS_UI: { key: ByDay; label: string }[] = [
  { key: 'MO', label: 'L' }, { key: 'TU', label: 'M' }, { key: 'WE', label: 'M' },
  { key: 'TH', label: 'J' }, { key: 'FR', label: 'V' }, { key: 'SA', label: 'S' }, { key: 'SU', label: 'D' },
];

export default function RecurrencePicker({ value, startDate, disabled, onChange, markPremium }: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startWeekday = WEEKDAY_FROM_DATE[startDate.getDay()];
  const startDayOfMonth = startDate.getDate();

  const presets = useMemo(() => ([
    { id: 'none',    label: 'No se repite',                                               rrule: null },
    { id: 'daily',   label: 'Diariamente',                                                rrule: 'FREQ=DAILY' },
    { id: 'weekly',  label: `Semanalmente los ${DAY_LABELS[startWeekday]}`,               rrule: `FREQ=WEEKLY;BYDAY=${startWeekday}` },
    { id: 'wkdays',  label: 'Días de semana (L-V)',                                       rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
    { id: 'monthly', label: `Mensualmente el día ${startDayOfMonth}`,                      rrule: `FREQ=MONTHLY;BYMONTHDAY=${startDayOfMonth}` },
  ]), [startWeekday, startDayOfMonth]);

  const matchedPreset = presets.find(p => p.rrule === value);
  const selectedKey = matchedPreset ? matchedPreset.id : (value ? 'custom' : 'none');
  const currentLabel = selectedKey === 'custom'
    ? 'Personalizado…'
    : (presets.find(p => p.id === selectedKey)?.label ?? 'No se repite');

  useEffect(() => {
    if (value && !matchedPreset) setShowCustom(true);
  }, [value, matchedPreset]);

  // Click outside closes the listbox
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(key: string) {
    setOpen(false);
    if (key === 'custom') {
      setShowCustom(true);
      const initial = value && !matchedPreset ? value : `FREQ=WEEKLY;BYDAY=${startWeekday}`;
      onChange(initial);
      return;
    }
    setShowCustom(false);
    const preset = presets.find(p => p.id === key);
    onChange(preset?.rrule ?? null);
  }

  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.22em] text-amber-100/60 font-medium">
        Repetir
      </label>
      <div ref={containerRef} className="relative mt-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`w-full bg-[#0e1014] border ${
            open ? 'border-amber-300/50 shadow-[0_0_0_3px_rgba(233,195,73,0.08)]' : 'border-stone-800/70 hover:border-stone-700/80'
          } rounded-xl px-4 py-3 pr-10 text-sm text-stone-100 font-body text-left outline-none disabled:opacity-50 transition-all cursor-pointer`}
        >
          {currentLabel}
        </button>
        <span
          className={`material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 text-[18px] pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          expand_more
        </span>

        {open && (
          <ul
            role="listbox"
            className="absolute z-30 left-0 right-0 mt-2 rounded-xl bg-stone-950/98 border border-stone-800/80 shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur-md overflow-hidden py-1"
          >
            {presets.map(p => {
              const isSelected = p.id === selectedKey;
              const isPremium = markPremium && p.id !== 'none';
              return (
                <li key={p.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => pick(p.id)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                      isSelected ? 'bg-amber-300/10 text-amber-100' : 'text-stone-200 hover:bg-stone-900/80 hover:text-amber-100'
                    }`}
                  >
                    <span>{p.label}</span>
                    {isPremium && <PremiumPill />}
                  </button>
                </li>
              );
            })}
            <li role="option" aria-selected={selectedKey === 'custom'}>
              <button
                type="button"
                onClick={() => pick('custom')}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-left transition-colors border-t border-stone-800/60 ${
                  selectedKey === 'custom' ? 'bg-amber-300/10 text-amber-100' : 'text-stone-200 hover:bg-stone-900/80 hover:text-amber-100'
                }`}
              >
                <span>Personalizado…</span>
                {markPremium && <PremiumPill />}
              </button>
            </li>
          </ul>
        )}
      </div>

      {showCustom && value && !disabled && (
        <CustomBlock value={value} startDate={startDate} onChange={onChange} />
      )}

      {value && (
        <p className="text-[11px] text-amber-200/80 mt-2 italic">
          {describeRRule(value, startDate)}
        </p>
      )}
      {disabled && (
        <p className="text-[10px] text-stone-500 mt-2">La recurrencia solo se modifica al editar “Toda la serie”.</p>
      )}
    </div>
  );
}

function PremiumPill() {
  return (
    <span
      className="shrink-0 text-[9px] uppercase tracking-[0.18em] font-medium text-stone-950 bg-gradient-to-br from-amber-200 via-amber-300 to-amber-400 rounded-full px-2.5 py-[2px] shadow-[0_1px_6px_rgba(233,195,73,0.4)] ring-1 ring-amber-200/40"
    >
      Premium
    </span>
  );
}

function CustomBlock({ value, startDate, onChange }: { value: string; startDate: Date; onChange: (r: string) => void }) {
  const parts = parseRRule(value);
  const [interval, setInterval] = useState(parts.interval ?? 1);
  const [freq, setFreq] = useState<Freq>(parts.freq);
  const [byDay, setByDay] = useState<ByDay[]>(parts.byDay ?? [WEEKDAY_FROM_DATE[startDate.getDay()]]);
  const [endsKind, setEndsKind] = useState<EndsKind>(parts.endsOn ? 'on' : parts.count ? 'after' : 'never');
  const [endsOn, setEndsOn] = useState<string>(
    parts.endsOn ? format(parts.endsOn, 'yyyy-MM-dd') : format(new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate()), 'yyyy-MM-dd')
  );
  const [count, setCount] = useState(parts.count ?? 8);

  useEffect(() => {
    const opts: Parameters<typeof buildRRule>[0] = { freq };
    if (interval > 1) opts.interval = interval;
    if (freq === 'WEEKLY') opts.byDay = byDay;
    if (freq === 'MONTHLY') opts.byMonthDay = startDate.getDate();
    if (endsKind === 'on') {
      const [yy, mm, dd] = endsOn.split('-').map(n => parseInt(n, 10));
      opts.endsOn = new Date(yy, mm - 1, dd);
    } else if (endsKind === 'after') {
      opts.count = count;
    }
    onChange(buildRRule(opts));
  }, [freq, interval, byDay, endsKind, endsOn, count, startDate, onChange]);

  function toggleDay(d: ByDay) {
    setByDay(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  return (
    <div className="mt-3 p-3 rounded-lg border border-stone-700/40 bg-stone-950/40 space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-stone-400">Cada</span>
        <input
          type="number" min={1} max={99} value={interval}
          onChange={e => setInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-14 bg-[#1b1f25] border border-stone-700/50 rounded-md px-2 py-1 text-stone-100"
        />
        <select
          value={freq}
          onChange={e => setFreq(e.target.value as Freq)}
          className="bg-[#1b1f25] border border-stone-700/50 rounded-md px-2 py-1 text-stone-100"
        >
          <option value="DAILY">{interval === 1 ? 'día' : 'días'}</option>
          <option value="WEEKLY">{interval === 1 ? 'semana' : 'semanas'}</option>
          <option value="MONTHLY">{interval === 1 ? 'mes' : 'meses'}</option>
        </select>
      </div>

      {freq === 'WEEKLY' && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400 mb-2">Repetir en</p>
          <div className="flex gap-1">
            {DAYS_UI.map(d => (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleDay(d.key)}
                className="w-7 h-7 rounded-full text-[11px] font-semibold transition-colors"
                style={{
                  background: byDay.includes(d.key) ? '#e9c349' : 'transparent',
                  color: byDay.includes(d.key) ? '#1c1917' : '#a8a29e',
                  border: '1px solid rgba(120,120,120,0.4)',
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400 mb-2">Termina</p>
        <div className="space-y-2 text-xs text-stone-300">
          <label className="flex items-center gap-2">
            <input type="radio" name="ends" checked={endsKind === 'never'} onChange={() => setEndsKind('never')} />
            Nunca
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="ends" checked={endsKind === 'on'} onChange={() => setEndsKind('on')} />
            El
            <input
              type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} disabled={endsKind !== 'on'}
              className="bg-[#1b1f25] border border-stone-700/50 rounded-md px-2 py-1 text-stone-100 disabled:opacity-40"
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="ends" checked={endsKind === 'after'} onChange={() => setEndsKind('after')} />
            Tras
            <input
              type="number" min={1} max={500} value={count}
              onChange={e => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              disabled={endsKind !== 'after'}
              className="w-14 bg-[#1b1f25] border border-stone-700/50 rounded-md px-2 py-1 text-stone-100 disabled:opacity-40"
            />
            veces
          </label>
        </div>
      </div>
    </div>
  );
}
