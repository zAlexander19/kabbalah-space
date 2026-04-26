import { motion } from 'framer-motion';
import type { SefiraResumen, PreguntaConEstado, Registro } from '../types';
import SefiraHeader from './SefiraHeader';
import LastReflection from './LastReflection';
import GuideQuestionsList from './GuideQuestionsList';
import ReflectionEditor from './ReflectionEditor';
import HistoryList from './HistoryList';

type Props = {
  resumen: SefiraResumen;
  description: string;
  preguntas: PreguntaConEstado[];
  registros: Registro[];
  onDataChanged: () => void;
};

export default function SefiraDetailPanel({ resumen, description, preguntas, registros, onDataChanged }: Props) {
  const ultima = registros[0] ?? null;

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
      className="space-y-6"
    >
      <Section><SefiraHeader resumen={resumen} description={description} /></Section>

      {ultima && (
        <Section><LastReflection registro={ultima} /></Section>
      )}

      <Section>
        <h4 className="text-xs uppercase tracking-[0.16em] text-stone-400 mb-3">Preguntas guía</h4>
        <GuideQuestionsList preguntas={preguntas} onSaved={onDataChanged} />
      </Section>

      <Section>
        <h4 className="text-xs uppercase tracking-[0.16em] text-stone-400 mb-3">Nueva reflexión</h4>
        <ReflectionEditor
          sefiraId={resumen.sefira_id}
          sefiraName={resumen.sefira_nombre}
          onSaved={onDataChanged}
        />
      </Section>

      {registros.length > 1 && (
        <Section><HistoryList registros={registros} /></Section>
      )}
    </motion.div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={{
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}
