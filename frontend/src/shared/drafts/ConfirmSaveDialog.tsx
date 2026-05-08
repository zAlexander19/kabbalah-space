import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

type Props = {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isSaving?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Generic two-button confirmation modal. Renders to document.body via portal.
 * The body is a ReactNode so callers can inject specific copy
 * ("Las respuestas se bloquearán por 30 días" / "Se creará la actividad").
 */
export function ConfirmSaveDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isSaving = false,
  errorMessage = null,
  onConfirm,
  onCancel,
}: Props) {
  // ESC closes (when not saving)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isSaving, onCancel]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-save-dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease }}
          className="fixed inset-0 z-[120] flex items-center justify-center px-4"
          aria-modal="true"
          role="dialog"
          aria-labelledby="confirm-save-title"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={isSaving ? undefined : onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.28, ease }}
            className="relative w-full max-w-md bg-stone-950/90 backdrop-blur-2xl border border-stone-800/60 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] overflow-hidden"
          >
            <div className="relative p-6">
              <h2
                id="confirm-save-title"
                className="font-serif text-xl text-amber-100/90 font-light tracking-tight mb-3"
              >
                {title}
              </h2>
              <div className="text-sm text-stone-300/90 leading-relaxed mb-5">
                {body}
              </div>

              {errorMessage && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 text-red-200 text-xs leading-relaxed">
                  {errorMessage}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg text-stone-300 hover:text-stone-100 hover:bg-stone-800/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-wide transition-colors"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/30 text-amber-100 text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_14px_rgba(233,195,73,0.15)]"
                >
                  {isSaving ? 'Guardando…' : confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
