import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useIaLectura } from '../hooks/useIaLectura';
import { SEFIRA_COLORS } from '../../shared/tokens';

/** Key en sessionStorage para "el usuario cerró la card hoy". */
const DISMISS_KEY_PREFIX = 'kspaceai-lectura-dismissed:';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Props = {
  /** Cambia el valor para forzar refetch (ej. al crear una actividad). */
  refreshKey?: unknown;
};

export default function CalendarioIaLectura({ refreshKey }: Props) {
  const { data, loading, error } = useIaLectura(refreshKey);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(DISMISS_KEY_PREFIX + todayKey()) === '1';
  });

  // Reset el dismissed si cambia el día (sesión larga cruzando medianoche)
  useEffect(() => {
    const check = () => {
      const flag = sessionStorage.getItem(DISMISS_KEY_PREFIX + todayKey()) === '1';
      setDismissed(flag);
    };
    const t = window.setInterval(check, 60000);
    return () => window.clearInterval(t);
  }, []);

  function handleDismiss() {
    sessionStorage.setItem(DISMISS_KEY_PREFIX + todayKey(), '1');
    setDismissed(true);
  }

  if (dismissed) return null;
  if (loading && !data) {
    // Skeleton sutil
    return (
      <div className="w-full rounded-xl bg-stone-900/30 border border-stone-800/40 px-5 py-4 mb-4">
        <div className="h-3 w-24 rounded bg-stone-800/60 animate-pulse mb-2" />
        <div className="h-4 w-2/3 rounded bg-stone-800/40 animate-pulse" />
      </div>
    );
  }
  if (error || !data) return null;

  // Render variantes por status
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full rounded-xl bg-gradient-to-br from-stone-900/60 to-stone-950/40 border border-stone-700/40 px-5 py-4 mb-4"
      >
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Cerrar lectura"
          className="absolute top-3 right-3 text-stone-500 hover:text-stone-200 transition-colors"
        >
          <X size={16} />
        </button>

        <div className="text-[10px] uppercase tracking-[0.16em] text-amber-200/80 mb-2">
          ✦ Lectura del mes
        </div>

        {data.status === 'weak' && (
          <>
            {data.message && (
              <p className="text-stone-200 text-sm leading-relaxed font-serif mb-3 pr-6">
                {data.message}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {data.weak_sefirot.map(s => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] px-2.5 py-1 rounded-full border"
                  style={{
                    background: `${SEFIRA_COLORS[s.id] ?? '#a3a3a3'}22`,
                    borderColor: `${SEFIRA_COLORS[s.id] ?? '#a3a3a3'}55`,
                    color: '#f5f5f5',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEFIRA_COLORS[s.id] ?? '#a3a3a3' }} />
                  {s.nombre} {s.score.toFixed(1)}
                </span>
              ))}
            </div>
          </>
        )}

        {data.status === 'balanced' && (
          <p className="text-stone-300 text-sm leading-relaxed font-serif pr-6">
            {data.message}
          </p>
        )}

        {data.status === 'no_data' && (
          <p className="text-stone-400 text-sm leading-relaxed font-serif italic pr-6">
            {data.message}
          </p>
        )}

        {data.status === 'disabled' && (
          <p className="text-stone-400 text-sm leading-relaxed font-serif pr-6">
            {data.message}
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
