import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import LoadingScreen from './components/LoadingScreen';
import CosmicBackground from './components/CosmicBackground';
import InicioNav from './components/InicioNav';
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
  onEnterEspejo: () => void;
};

/**
 * Landing page for Kabbalah Space. Marketing-style layout: nav, hero,
 * premise, modules, sefirot grid, marquee, final CTA, footer. Sections
 * get added one task at a time after this scaffolding lands.
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
      <InicioNav onEnterEspejo={onEnterEspejo} />
      <main className="relative">
        <InicioHero onEnterEspejo={onEnterEspejo} />
        <InicioPremisa />
        <InicioModulos />
        <InicioSefirot />
        <InicioMarquee />
        <InicioCtaFinal onEnterEspejo={onEnterEspejo} />
        <InicioFooter />
      </main>
    </>
  );
}
