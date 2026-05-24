import { useEffect, useState } from 'react';

import { getEmailPreferences, updateEmailPreferences } from '../premium/api';
import type { EmailPreferences, EmailPreferenceKey } from '../premium/types';

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  saving: boolean;
}

function ToggleRow({ label, description, checked, onChange, saving }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-stone-800/60 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-stone-200">{label}</p>
        <p className="text-xs text-stone-500 leading-snug mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={saving}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 rounded-full transition-colors shrink-0 mt-0.5 ${
          checked ? 'bg-amber-300/70' : 'bg-stone-700'
        } ${saving ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-stone-950 shadow transform transition-transform mt-0.5 ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}


const TOGGLES: { key: EmailPreferenceKey; label: string; description: string }[] = [
  {
    key: 'weekly_summary',
    label: 'Resumen semanal',
    description: 'Domingo a la mañana: top sefirot, reflexiones, lectura de la semana.',
  },
  {
    key: 'monthly_summary',
    label: 'Resumen mensual',
    description: 'Día 1 de cada mes: evolución del mes con comparativa con el anterior.',
  },
  {
    key: 'imbalance_alerts',
    label: 'Alertas de desbalance',
    description: 'Cuando una sefirá lleva más de 14 días sin atención.',
  },
  {
    key: 'reflection_reminders',
    label: 'Recordatorios de reflexión',
    description: 'Si pasaste 7 días sin entrar, una pregunta guía te espera.',
  },
];


export function EmailPreferencesSection() {
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<EmailPreferenceKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getEmailPreferences();
        if (!cancelled) setPrefs(p);
      } catch (e) {
        // 404 = free user with no prefs row → hide the section silently.
        const msg = e instanceof Error ? e.message : 'unknown';
        if (!cancelled) {
          setPrefs(null);
          if (msg !== 'no_email_preferences') setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function toggle(key: EmailPreferenceKey) {
    if (!prefs || saving) return;
    const next = { ...prefs, [key]: !prefs[key] };
    const previous = prefs;
    setPrefs(next);  // optimistic
    setSaving(key);
    setError(null);
    try {
      const updated = await updateEmailPreferences({ [key]: next[key] });
      setPrefs(updated);
    } catch (e) {
      // Roll back local state
      setPrefs(previous);
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-[#15181d] border border-stone-700/40 rounded-2xl p-6">
        <p className="text-stone-400 text-sm">Cargando preferencias de correo...</p>
      </div>
    );
  }

  if (prefs === null) {
    // Free user (or fetch error) — don't render the section at all.
    return null;
  }

  return (
    <div className="bg-[#15181d] border border-stone-700/40 rounded-2xl p-6 space-y-2">
      <div className="mb-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-1">
          Preferencias de correo
        </p>
        <h3 className="font-serif text-xl text-amber-100/95">Seguimiento por email</h3>
      </div>
      <div>
        {TOGGLES.map(({ key, label, description }) => (
          <ToggleRow
            key={key}
            label={label}
            description={description}
            checked={prefs[key]}
            onChange={() => toggle(key)}
            saving={saving === key}
          />
        ))}
      </div>
      {error && (
        <p className="text-red-300 text-xs mt-2" role="alert">{error}</p>
      )}
    </div>
  );
}
