import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { VolumeItem } from '../types';
import { SEFIRA_COLORS } from '../tokens';
import { breathFast } from '../motion/breath';
import { staggerContainer, fadeUp } from '../motion/transitions';

type Props = {
  volume: VolumeItem[];
  filterId: string | null;
  onFilterToggle: (id: string) => void;
};

export default function SefirotLegend({ volume, filterId, onFilterToggle }: Props) {
  const sorted = useMemo(() => {
    return [...volume].sort((a, b) => b.actividades_total - a.actividades_total || b.horas_total - a.horas_total);
  }, [volume]);

  const maxCount = Math.max(1, ...volume.map(v => v.actividades_total));

  if (sorted.length === 0) {
    return (
      <p className="text-xs text-stone-500 italic mt-4 text-center">
        Sin actividades aún en este rango.
      </p>
    );
  }

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-1 mt-4">
      {sorted.map(item => {
        const isActive = filterId === item.sefira_id;
        const color = SEFIRA_COLORS[item.sefira_id] ?? '#a3a3a3';
        const ratio = item.actividades_total / maxCount;
        return (
          <motion.button
            key={item.sefira_id}
            variants={fadeUp}
            type="button"
            onClick={() => onFilterToggle(item.sefira_id)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${isActive ? 'bg-stone-800/60 border-amber-300/30' : 'bg-stone-950/30 border-stone-800/50 hover:bg-stone-900/60'}`}
          >
            <motion.span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: color }}
              variants={isActive ? breathFast : undefined}
              animate={isActive ? 'animate' : undefined}
            />
            <span className="text-xs text-stone-200 font-medium flex-1 text-left truncate">{item.sefira_nombre}</span>
            <div className="flex-1 max-w-[80px] h-1 rounded-full bg-stone-800 overflow-hidden">
              <div className="h-full" style={{ width: `${ratio * 100}%`, background: color, opacity: 0.7 }} />
            </div>
            <span className="text-[10px] text-amber-200/80 tabular-nums shrink-0">
              {item.actividades_total} · {item.horas_total}h
            </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
