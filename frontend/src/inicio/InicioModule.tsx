import { motion } from 'framer-motion';
import Section1Hook from './components/Section1Hook';
import Section2Promise from './components/Section2Promise';
import Section3Path from './components/Section3Path';
import Section4Bridge from './components/Section4Bridge';
import Section5Tool from './components/Section5Tool';

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
      <Section1Hook />
      <Section2Promise />
      <Section3Path />
      <Section4Bridge />
      <Section5Tool />
      {/* Section 6 (CTA) lands here in the next task. */}
      <div className="py-24 text-center text-stone-400 italic">
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
