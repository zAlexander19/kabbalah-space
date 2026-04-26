import { motion } from 'framer-motion';
import type { Activity } from '../types';
import { SEFIRA_COLORS } from '../../shared/tokens';
import { eventChip } from '../motion/transitions';

type Variant = 'week' | 'month';

type Props = {
  activity: Activity;
  variant: Variant;
  style?: React.CSSProperties;
  onClick?: (a: Activity) => void;
};

export default function CalendarEvent({ activity, variant, style, onClick }: Props) {
  const color = SEFIRA_COLORS[activity.sefirot[0]?.id] ?? '#eab308';
  const sefirotLabel = activity.sefirot.map(s => s.nombre).join(', ');
  const isRecurring = !!activity.serie_id;

  const recurringBorder: React.CSSProperties = isRecurring
    ? { boxShadow: `inset 4px 0 0 -2px ${color}99` }
    : {};

  if (variant === 'week') {
    return (
      <motion.div
        layoutId={`event-${activity.id}`}
        variants={eventChip}
        initial="initial"
        animate="animate"
        exit="exit"
        whileHover={{ y: -1 }}
        onClick={() => onClick?.(activity)}
        className="absolute left-1 right-1 rounded-md px-2 py-1 cursor-pointer overflow-hidden"
        style={{
          ...style,
          background: `${color}33`,
          borderLeft: `2px solid ${color}`,
          ...recurringBorder,
        }}
      >
        <div className="text-[11px] font-semibold text-stone-100 truncate">{activity.titulo}</div>
        <div className="text-[10px] text-stone-300/80 truncate">{sefirotLabel}</div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layoutId={`event-${activity.id}`}
      variants={eventChip}
      initial="initial"
      animate="animate"
      exit="exit"
      whileHover={{ x: 1 }}
      onClick={(e) => { e.stopPropagation(); onClick?.(activity); }}
      className="rounded-sm px-1.5 py-0.5 cursor-pointer overflow-hidden truncate text-[10px] text-stone-100"
      style={{ background: `${color}33`, borderLeft: `2px solid ${color}`, ...recurringBorder }}
    >
      {activity.titulo}
    </motion.div>
  );
}
