import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEspejoSummary } from './hooks/useEspejoSummary';
import { useSefiraData } from './hooks/useSefiraData';
import SefirotInteractiveTree, { type SefiraNode } from './components/SefirotInteractiveTree';
import RotatingReflectionPreview from './components/RotatingReflectionPreview';
import EmptyState from './components/EmptyState';
import SefiraDetailPanel from './components/SefiraDetailPanel';

type Props = {
  sefirot: SefiraNode[];
  glassEffect: string;
};

export default function EspejoModule({ sefirot, glassEffect }: Props) {
  const { summary, reload: reloadSummary } = useEspejoSummary();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { preguntas, registros, reload: reloadSefira } = useSefiraData(selectedId);

  const selectedNode = useMemo(() => sefirot.find(s => s.id === selectedId) ?? null, [sefirot, selectedId]);
  const selectedResumen = useMemo(() => summary.find(s => s.sefira_id === selectedId) ?? null, [summary, selectedId]);

  function handleDataChanged() {
    void reloadSummary();
    void reloadSefira();
  }

  return (
    <div className="w-full max-w-[1400px] flex flex-col md:flex-row items-center md:items-start justify-center gap-10 xl:gap-8 relative">
      <div className="relative shrink-0">
        <SefirotInteractiveTree
          sefirot={sefirot}
          summary={summary}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <RotatingReflectionPreview
          sefirot={sefirot}
          summary={summary}
          active={selectedId === null}
          onSelectSefira={setSelectedId}
        />
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
