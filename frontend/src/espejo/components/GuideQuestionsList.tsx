import { motion } from 'framer-motion';
import type { PreguntaConEstado } from '../types';
import QuestionCard from './QuestionCard';

type Props = {
  preguntas: PreguntaConEstado[];
  onSaved: () => void;
};

export default function GuideQuestionsList({ preguntas, onSaved }: Props) {
  if (preguntas.length === 0) {
    return (
      <p className="text-xs text-stone-500 italic text-center py-4">
        No hay preguntas guía para esta sefirá. Agregá algunas desde el Panel de Administrador.
      </p>
    );
  }
  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
      className="space-y-3"
    >
      {preguntas.map(p => (
        <motion.div
          key={p.pregunta_id}
          variants={{
            initial: { opacity: 0, y: 8 },
            animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
          }}
        >
          <QuestionCard pregunta={p} onSaved={onSaved} />
        </motion.div>
      ))}
    </motion.div>
  );
}
