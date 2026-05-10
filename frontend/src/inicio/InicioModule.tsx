import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Section1Hook from './components/Section1Hook';
import Section2Promise from './components/Section2Promise';
import Section3Path from './components/Section3Path';
import Section4Bridge from './components/Section4Bridge';
import Section5Tool from './components/Section5Tool';
import Section6Cta from './components/Section6Cta';
import LoadingScreen from './components/LoadingScreen';
import CosmicBackground from './components/CosmicBackground';

const LOADING_FLAG = 'kabbalah-loading-done';

function shouldSkipLoading(): boolean {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return true;
  }
  return window.sessionStorage.getItem(LOADING_FLAG) === '1';
}

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Welcome / manifiesto landing. Renders the cosmic background, an optional
 * one-time loading screen (gated by sessionStorage), and the six manifiesto
 * sections in order. The CTA at the end fires `onEnterEspejo`, which the
 * App-level handler turns into a `setActiveView('espejo')`.
 */
export default function InicioModule({ onEnterEspejo }: Props) {
  const [loadingDone, setLoadingDone] = useState<boolean>(() => shouldSkipLoading());

  const handleLoadingComplete = () => {
    try {
      window.sessionStorage.setItem(LOADING_FLAG, '1');
    } catch {
      /* sessionStorage may be unavailable (private mode); ignore */
    }
    setLoadingDone(true);
  };

  return (
    <>
      <CosmicBackground />
      <AnimatePresence>
        {!loadingDone && <LoadingScreen key="loading" onComplete={handleLoadingComplete} />}
      </AnimatePresence>
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
        <Section6Cta onEnterEspejo={onEnterEspejo} />
      </motion.main>
    </>
  );
}
