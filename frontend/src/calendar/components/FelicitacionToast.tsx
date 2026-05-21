import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import type { Felicitacion } from '../hooks/useFelicitacion';
import { SEFIRA_COLORS } from '../../shared/tokens';

type Props = {
  felicitacion: Felicitacion | null;
  onDismiss: () => void;
};

export default function FelicitacionToast({ felicitacion, onDismiss }: Props) {
  const borderColor = felicitacion
    ? (SEFIRA_COLORS[felicitacion.sefira_id] ?? '#e9c349')
    : '#e9c349';

  return (
    <AnimatePresence>
      {felicitacion && (
        <motion.div
          key={felicitacion.sefira_id + felicitacion.count}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-20 right-6 z-50 max-w-sm rounded-xl bg-stone-950/95 backdrop-blur-xl border border-stone-700/50 shadow-2xl pl-4 pr-3 py-3 flex items-start gap-3"
          style={{ borderLeftColor: borderColor, borderLeftWidth: 3 }}
        >
          <Sparkles size={16} className="text-amber-200 mt-0.5 shrink-0" />
          <p className="text-sm text-stone-200 leading-snug font-serif pr-2">
            {felicitacion.message}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar"
            className="text-stone-500 hover:text-stone-200 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
