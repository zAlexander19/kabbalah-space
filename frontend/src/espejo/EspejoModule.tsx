import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEspejoSummary } from './hooks/useEspejoSummary';
import { useSefiraData } from './hooks/useSefiraData';
import SefirotInteractiveTree, { type SefiraNode } from './components/SefirotInteractiveTree';
import RotatingReflectionPreview from './components/RotatingReflectionPreview';
import EmptyState from './components/EmptyState';
import SefiraDetailPanel from './components/SefiraDetailPanel';
import EspejoIntro from './components/EspejoIntro';

type Props = {
  sefirot: SefiraNode[];
  glassEffect: string;
  introPlaying?: boolean;
  pageRevealed?: boolean;
  onIntroComplete?: () => void;
};

const ease = [0.16, 1, 0.3, 1] as const;

export default function EspejoModule({
  sefirot,
  glassEffect,
  introPlaying = false,
  pageRevealed = true,
  onIntroComplete,
}: Props) {
  const { summary, reload: reloadSummary } = useEspejoSummary();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { preguntas, registros, reload: reloadSefira } = useSefiraData(selectedId);

  // Defer mount of the rotating card by ~700ms after the intro completes.
  // This prevents a stutter at the moment the intro starts unmounting:
  // mounting RotatingReflectionPreview (with its hooks + motion components)
  // in the same React render as the intro's exit animation produces a frame drop.
  const [showRotatingCard, setShowRotatingCard] = useState(!introPlaying);
  useEffect(() => {
    if (introPlaying) {
      setShowRotatingCard(false);
      return;
    }
    const t = window.setTimeout(() => setShowRotatingCard(true), 700);
    return () => window.clearTimeout(t);
  }, [introPlaying]);

  const selectedNode = useMemo(() => sefirot.find(s => s.id === selectedId) ?? null, [sefirot, selectedId]);
  const selectedResumen = useMemo(() => summary.find(s => s.sefira_id === selectedId) ?? null, [summary, selectedId]);

  function handleDataChanged() {
    void reloadSummary();
    void reloadSefira();
  }

  // El árbol internamente trabaja en un sistema 400×880 px. Lo escalamos para
  // que el conjunto entero (árbol + intro + card rotativa) entre en el viewport
  // sin que ningún hijo se desalinee. Outer toma las dimensiones escaladas;
  // inner mantiene la lógica original con scale transform.
  const TREE_W = 400;
  const TREE_H = 880;
  const TREE_SCALE = 1.05;
  return (
    <div className="w-full max-w-[1400px] flex flex-col md:flex-row items-center md:items-start justify-between gap-10 xl:gap-12 relative">
      <div className="relative shrink-0" style={{ width: TREE_W * TREE_SCALE, height: TREE_H * TREE_SCALE }}>
        <div
          className="absolute top-0 left-0"
          style={{ width: TREE_W, height: TREE_H, transform: `scale(${TREE_SCALE})`, transformOrigin: 'top left' }}
        >
          <motion.div
            animate={{ opacity: introPlaying ? 0 : 1 }}
            transition={{ duration: 0.5, ease }}
          >
            <SefirotInteractiveTree
              sefirot={sefirot}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </motion.div>

          {showRotatingCard && (
            <RotatingReflectionPreview
              sefirot={sefirot}
              summary={summary}
              active={selectedId === null}
              onSelectSefira={setSelectedId}
            />
          )}

          <AnimatePresence>
            {introPlaying && onIntroComplete && (
              <motion.div
                key="espejo-intro-wrapper"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease }}
                className="absolute inset-0"
              >
                <EspejoIntro sefirot={sefirot} onComplete={onIntroComplete} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <motion.div
        initial={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : 30 }}
        animate={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : 30 }}
        transition={{ duration: 0.7, delay: pageRevealed ? 0.75 : 0, ease }}
        className="w-full flex-1 max-w-md xl:max-w-lg mt-8 md:mt-0"
      >
        <div className={`p-8 sm:p-10 rounded-3xl min-h-[500px] ${glassEffect}`}>
          <AnimatePresence mode="wait">
            {selectedNode && selectedResumen ? (
              <motion.div
                key={selectedNode.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <SefiraDetailPanel
                  resumen={selectedResumen}
                  description={selectedNode.description}
                  preguntas={preguntas}
                  registros={registros}
                  onDataChanged={handleDataChanged}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <EmptyState />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
