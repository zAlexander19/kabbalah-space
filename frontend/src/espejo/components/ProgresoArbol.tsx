import { motion } from 'framer-motion';

type Props = { total: number; completadas: number };

export default function ProgresoArbol({ total, completadas }: Props) {
  const pct = total > 0 ? (completadas / total) * 100 : 0;
  const done = completadas >= total && total > 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] uppercase tracking-[0.16em] text-stone-400 whitespace-nowrap">
        {done ? '¡Árbol completo!' : `${completadas} de ${total} dimensiones exploradas`}
      </span>
      <div className="h-[3px] w-28 bg-stone-800/60 rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${done ? 'bg-amber-300' : 'bg-amber-300/70'}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}
