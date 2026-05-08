import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SefiraResumen } from './types';
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
  introPlaying: introPlayingProp = false,
  pageRevealed = true,
  onIntroComplete,
}: Props) {
  // Belt-and-suspenders: if the sessionStorage flag is already set (the intro
  // was completed in this browser session), force introPlaying to false even
  // if the prop arrives as true. This protects against stale App-level state
  // after navigations.
  const introAlreadySeen =
    typeof window !== 'undefined' && window.sessionStorage?.getItem('espejo-intro-done') === '1';
  const introPlaying = introPlayingProp && !introAlreadySeen;

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
  // Prefer the per-user resumen when available; otherwise synthesize a minimal
  // one from the selected node so anonymous users can still open the panel and
  // reach the carousel + drafts flow before logging in.
  const selectedResumen = useMemo<SefiraResumen | null>(() => {
    if (!selectedNode) return null;
    const real = summary.find(s => s.sefira_id === selectedId);
    if (real) return real;
    return {
      sefira_id: selectedNode.id,
      sefira_nombre: selectedNode.name,
      preguntas_total: 0,
      preguntas_frescas: 0,
      preguntas_disponibles: 0,
      score_ia_promedio: null,
      score_ia_ultimos: [],
      ultima_reflexion_texto: null,
      ultima_reflexion_score: null,
      ultima_actividad: null,
      intensidad: 0,
    };
  }, [summary, selectedId, selectedNode]);

  function handleDataChanged() {
    void reloadSummary();
    void reloadSefira();
  }

  // El árbol internamente trabaja en un sistema 400×880 px. Lo escalamos para
  // que el conjunto entero (árbol + intro + card rotativa) entre en el viewport
  // sin que ningún hijo se desalinee. Outer toma las dimensiones escaladas;
  // inner mantiene la lógica original con scale transform.
  //
  // LEFT_GUTTER reserva espacio dentro del wrapper para que las cards flotantes
  // de las sefirot del pilar izquierdo (Biná, Guevurá, Hod, Maljut) — que se
  // posicionan en `x - 30 - CARD_W` del sistema interno — no queden cortadas
  // por el `overflow-hidden` del layout de la página. En mobile (<768px) esa
  // gutter sumada al ancho del árbol no entra en la pantalla, así que la
  // anulamos y reducimos la escala — la card rotativa queda más justa pero al
  // menos el árbol entra completo.
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const TREE_W = 400;
  const TREE_H = 880;
  const TREE_SCALE = isMobile ? 0.7 : 0.95;
  const LEFT_GUTTER = isMobile ? 0 : 180;
  return (
    <div className="w-full max-w-[1400px] flex flex-col md:flex-row items-center md:items-start justify-between gap-10 xl:gap-12 relative">
      <div className="relative shrink-0" style={{ width: TREE_W * TREE_SCALE + LEFT_GUTTER, height: TREE_H * TREE_SCALE }}>
        <div
          className="absolute top-0"
          style={{ left: LEFT_GUTTER, width: TREE_W, height: TREE_H, transform: `scale(${TREE_SCALE})`, transformOrigin: 'top left' }}
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
