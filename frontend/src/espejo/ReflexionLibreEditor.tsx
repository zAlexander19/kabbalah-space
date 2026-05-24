import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { createReflexionLibre } from '../premium';

const ease = [0.16, 1, 0.3, 1] as const;
const DRAFT_PREFIX = 'reflexion-libre-draft-';

interface ReflexionLibreEditorProps {
  open: boolean;
  tipo: 'sefira' | 'arbol';
  sefiraId?: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Editor for a free-form reflection (sefirá-specific or whole-tree).
 *
 * Gating strategy: NO gate on open. The user writes freely. On Save, if the
 * backend returns 402 (free_reflection_limit), the apiFetch interceptor opens
 * the PremiumGate modal — we DO NOT clear the content. The text persists in
 * localStorage so a future Premium conversion can pick up where they left off.
 */
export function ReflexionLibreEditor({
  open,
  tipo,
  sefiraId,
  onClose,
  onSaved,
}: ReflexionLibreEditorProps) {
  const draftKey = `${DRAFT_PREFIX}${tipo}-${sefiraId ?? 'arbol'}`;
  const [contenido, setContenido] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore draft on open
  useEffect(() => {
    if (!open) return;
    try {
      const draft = localStorage.getItem(draftKey);
      if (draft) setContenido(draft);
    } catch {
      /* localStorage disabled — start fresh */
    }
  }, [open, draftKey]);

  // Persist draft on change
  useEffect(() => {
    if (!open) return;
    try {
      if (contenido) localStorage.setItem(draftKey, contenido);
      else localStorage.removeItem(draftKey);
    } catch {
      /* noop */
    }
  }, [contenido, open, draftKey]);

  async function handleSave() {
    if (!contenido.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createReflexionLibre({
        tipo,
        sefira_id: sefiraId,
        contenido: contenido.trim(),
      });
      // Success: clear draft + close
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* noop */
      }
      setContenido('');
      onSaved();
      onClose();
    } catch (e) {
      // 402 already triggered the PremiumGate via interceptor — don't show a
      // separate error for that case. Show inline error only for other failures.
      const msg = e instanceof Error ? e.message : 'unknown';
      if (msg !== 'free_reflection_limit') {
        setError(msg);
      }
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Reflexión libre"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease }}
            className="relative w-full max-w-2xl rounded-2xl bg-stone-950/95 border border-stone-800/70 shadow-[0_24px_80px_rgba(0,0,0,0.6)] p-6 md:p-7 space-y-4"
          >
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">
                Reflexión libre
              </p>
              <h2 className="font-serif text-2xl text-amber-100/95">
                {tipo === 'sefira' ? `Reflexión sobre ${sefiraId}` : 'Reflexión sobre el árbol'}
              </h2>
            </div>

            <textarea
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder="Escribí lo que necesites volcar..."
              rows={10}
              className="w-full bg-stone-900/80 border border-stone-800/70 rounded-xl p-4 text-stone-200 text-sm placeholder-stone-600 focus:outline-none focus:border-amber-300/40 transition-colors resize-y"
            />

            {error && (
              <p className="text-red-300 text-sm" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full text-stone-400 hover:text-stone-200 text-xs tracking-wide transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submitting || !contenido.trim()}
                onClick={handleSave}
                className="px-5 py-2 rounded-full bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/40 text-amber-100 text-xs tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Guardando...' : 'Guardar reflexión'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
