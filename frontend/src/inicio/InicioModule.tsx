import { motion } from 'framer-motion';

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Welcome / manifiesto landing. Long-scroll page broken into six section
 * components rendered by this container. The final CTA fires
 * `onEnterEspejo`, which the App-level handler turns into a
 * `setActiveView('espejo')`.
 */
export default function InicioModule({ onEnterEspejo }: Props) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto px-6 md:px-8"
    >
      <div className="py-32 text-center text-stone-400 italic">
        Manifiesto en construcción.{' '}
        <button
          type="button"
          onClick={onEnterEspejo}
          className="underline text-amber-200 hover:text-amber-100 transition-colors"
        >
          Entrar al Árbol de la Vida
        </button>
      </div>
    </motion.main>
  );
}
