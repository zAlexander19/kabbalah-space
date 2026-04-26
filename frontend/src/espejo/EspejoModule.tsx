import { useCallback, useMemo, useState } from 'react';
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
};

const INTRO_FLAG = 'espejo-intro-done';

function shouldPlayIntro(): boolean {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return false;
  return window.sessionStorage.getItem(INTRO_FLAG) !== '1';
}

export default function EspejoModule({ sefirot, glassEffect }: Props) {
  const { summary, reload: reloadSummary } = useEspejoSummary();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { preguntas, registros, reload: reloadSefira } = useSefiraData(selectedId);

  const [introPlaying, setIntroPlaying] = useState<boolean>(shouldPlayIntro);

  const selectedNode = useMemo(() => sefirot.find(s => s.id === selectedId) ?? null, [sefirot, selectedId]);
  const selectedResumen = useMemo(() => summary.find(s => s.sefira_id === selectedId) ?? null, [summary, selectedId]);

  const handleIntroComplete = useCallback(() => {
    setIntroPlaying(false);
    if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
      window.sessionStorage.setItem(INTRO_FLAG, '1');
    }
  }, []);

  function handleDataChanged() {
    void reloadSummary();
    void reloadSefira();
  }

  return (
    <div className="w-full max-w-[1400px] flex flex-col md:flex-row items-center md:items-start justify-center gap-10 xl:gap-8 relative">
      <div className="relative shrink-0">
        <motion.div
          animate={{ opacity: introPlaying ? 0 : 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <SefirotInteractiveTree
            sefirot={sefirot}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </motion.div>

        {!introPlaying && (
          <RotatingReflectionPreview
            sefirot={sefirot}
            summary={summary}
            active={selectedId === null}
            onSelectSefira={setSelectedId}
          />
        )}

        <AnimatePresence>
          {introPlaying && (
            <motion.div
              key="espejo-intro-wrapper"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
            >
              <EspejoIntro sefirot={sefirot} onComplete={handleIntroComplete} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full flex-1 max-w-md xl:max-w-lg mt-8 md:mt-0">
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
      </div>
    </div>
  );
}
