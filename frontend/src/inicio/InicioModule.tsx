import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import LoadingScreen from './components/LoadingScreen';
import CosmicBackground from './components/CosmicBackground';
import type { InicioNavTarget } from './components/InicioNav';
import InicioHero from './components/InicioHero';
import InicioPremisa from './components/InicioPremisa';
import InicioModulos from './components/InicioModulos';
import InicioSefirot from './components/InicioSefirot';
import InicioMarquee from './components/InicioMarquee';
import InicioCtaFinal from './components/InicioCtaFinal';
import InicioFooter from './components/InicioFooter';

const LOADING_FLAG = 'kabbalah-loading-done';

function shouldSkipLoading(): boolean {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return true;
  }
  return window.sessionStorage.getItem(LOADING_FLAG) === '1';
}

type Props = {
  onNavigate: (target: InicioNavTarget) => void;
};

export default function InicioModule({ onNavigate }: Props) {
  const [loadingDone, setLoadingDone] = useState<boolean>(() => shouldSkipLoading());

  const handleLoadingComplete = () => {
    try {
      window.sessionStorage.setItem(LOADING_FLAG, '1');
    } catch {
      /* sessionStorage may be unavailable (private mode); ignore */
    }
    setLoadingDone(true);
  };

  const goToEspejo = () => onNavigate('espejo');

  return (
    <>
      <CosmicBackground />
      <AnimatePresence>
        {!loadingDone && <LoadingScreen key="loading" onComplete={handleLoadingComplete} />}
      </AnimatePresence>
      <main className="relative">
        <InicioHero onEnterEspejo={goToEspejo} />
        <InicioPremisa />
        <InicioModulos />
        <InicioSefirot />
        <InicioMarquee />
        <InicioCtaFinal onEnterEspejo={goToEspejo} />
        <InicioFooter />
      </main>
    </>
  );
}
