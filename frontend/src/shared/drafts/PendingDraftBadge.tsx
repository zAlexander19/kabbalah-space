import { motion } from 'framer-motion';

type Props = {
  visible: boolean;
  message?: string;
};

/**
 * Inline indicator: "you have an unsaved draft". Render where the user's
 * eyes are — typically just above the form they're editing.
 */
export function PendingDraftBadge({ visible, message = 'Tenés un borrador sin guardar' }: Props) {
  if (!visible) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-300/10 border border-amber-300/30 text-amber-200/85 text-[11px] tracking-wide"
      role="status"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-300/80" aria-hidden />
      {message}
    </motion.div>
  );
}
