import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import type { Activity } from '../types';
import { SEFIRA_COLORS } from '../../shared/tokens';
import { eventChip } from '../motion/transitions';
import { useLongPress } from '../hooks/useLongPress';
import ActividadSyncBadge from './ActividadSyncBadge';

type Variant = 'week' | 'month';

type Props = {
  activity: Activity;
  variant: Variant;
  style?: React.CSSProperties;
  onClick?: (a: Activity) => void;
  onEdit?: (a: Activity) => void;
  onDelete?: (a: Activity) => void;
  gcalEnabled?: boolean;
  /** Cuando true, mantener apretado 500ms activa modo drag. Solo para vistas mobile. */
  enableLongPressDrag?: boolean;
  /** Callback al soltar el drag sobre una nueva fecha/hora. Solo aplica cuando enableLongPressDrag=true. */
  onMove?: (id: string, newStart: Date, newEnd: Date) => void;
};

export default function CalendarEvent({
  activity, variant, style, onClick, onEdit, onDelete, gcalEnabled = false,
  enableLongPressDrag = false, onMove,
}: Props) {
  const color = SEFIRA_COLORS[activity.sefirot[0]?.id] ?? '#eab308';
  const sefirotLabel = activity.sefirot.map(s => s.nombre).join(', ');
  const isRecurring = !!activity.serie_id;

  const recurringBorder: React.CSSProperties = isRecurring
    ? { boxShadow: `inset 4px 0 0 -2px ${color}99` }
    : {};

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const confirmTimerRef = useRef<number | null>(null);

  // Close the menu when clicking anywhere outside it, or pressing Escape.
  // Uses `click` (not `mousedown`) so the chip's own onClick handler can
  // run first and decide whether to swallow the click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('click', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Reset confirm-delete state whenever the menu closes (or the activity
  // identity changes after a reload).
  useEffect(() => {
    if (!menuOpen) {
      setConfirmingDelete(false);
      if (confirmTimerRef.current) {
        window.clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    }
  }, [menuOpen, activity.id]);

  function handleChipClick() {
    // If the kebab menu is open, the click is interpreted as "close the
    // menu" — don't also open the edit panel.
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    onClick?.(activity);
  }

  function handleKebabClick(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(v => !v);
  }

  function handleEditFromMenu(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    (onEdit ?? onClick)?.(activity);
  }

  function handleDeleteFromMenu(e: React.MouseEvent) {
    e.stopPropagation();
    // Series: defer to the parent so it can show the scope dialog
    // (delete one vs delete entire series).
    if (activity.serie_id) {
      setMenuOpen(false);
      onDelete?.(activity);
      return;
    }
    // Single: require a second click to confirm. Reverts after 3s.
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = window.setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    setMenuOpen(false);
    onDelete?.(activity);
  }

  const [dragging, setDragging] = useState(false);

  const longPressHandlers = useLongPress<HTMLDivElement>(
    () => {
      if (enableLongPressDrag) setDragging(true);
    },
    { delay: 500, cancelOnMove: true, moveThreshold: 10 },
  );

  const handleDragEnd = (e: PointerEvent | MouseEvent | TouchEvent) => {
    setDragging(false);
    if (!onMove) return;
    const clientX = 'clientX' in e ? e.clientX : (e as TouchEvent).changedTouches[0]?.clientX ?? 0;
    const clientY = 'clientY' in e ? e.clientY : (e as TouchEvent).changedTouches[0]?.clientY ?? 0;
    const els = document.elementsFromPoint(clientX, clientY);
    // Prefer slot (week view: explicit day+hour). Fall back to day (month view: preserve hour).
    const slotEl = els.find((el) => el instanceof HTMLElement && el.dataset.slot);
    const dayEl = els.find((el) => el instanceof HTMLElement && el.dataset.day);
    const target = slotEl ?? dayEl;
    if (!(target instanceof HTMLElement)) return;
    const startD = new Date(activity.inicio);
    const endD = new Date(activity.fin);
    const durationMs = endD.getTime() - startD.getTime();
    let newStart: Date;
    if (target.dataset.slot) {
      const [dayStr, hourStr] = target.dataset.slot.split('|');
      const [y, m, d] = dayStr.split('-').map(Number);
      const hour = Number(hourStr);
      newStart = new Date(y, m - 1, d, hour, 0, 0, 0);
    } else if (target.dataset.day) {
      const [y, m, d] = target.dataset.day.split('-').map(Number);
      // Preserve original hour/minute of the activity.
      newStart = new Date(y, m - 1, d, startD.getHours(), startD.getMinutes(), 0, 0);
    } else {
      return;
    }
    const newEnd = new Date(newStart.getTime() + durationMs);
    onMove(activity.id, newStart, newEnd);
  };

  const menu = (
    <AnimatePresence>
      {menuOpen && (
        <motion.div
          key="kebab-menu"
          initial={{ opacity: 0, y: -4, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.96 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          role="menu"
          className="absolute right-0 top-full mt-1 z-30 w-32 rounded-md bg-stone-950/95 backdrop-blur-md border border-stone-700/60 shadow-[0_8px_28px_rgba(0,0,0,0.5)] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleEditFromMenu}
            className="w-full px-3 py-2 flex items-center gap-2 text-[11px] text-stone-200 hover:bg-stone-800/80 transition-colors"
          >
            <Pencil size={12} className="text-stone-400" />
            Editar
          </button>
          <div className="h-px bg-stone-800/70" />
          <button
            type="button"
            role="menuitem"
            onClick={handleDeleteFromMenu}
            className={`w-full px-3 py-2 flex items-center gap-2 text-[11px] transition-colors ${
              confirmingDelete
                ? 'bg-red-500/25 text-red-200'
                : 'text-red-300 hover:bg-red-500/15'
            }`}
          >
            <Trash2 size={12} />
            {activity.serie_id ? 'Eliminar…' : (confirmingDelete ? '¿Confirmar?' : 'Eliminar')}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (variant === 'week') {
    return (
      <motion.div
        ref={menuContainerRef}
        layoutId={`event-${activity.id}`}
        variants={eventChip}
        initial="initial"
        animate="animate"
        exit="exit"
        whileHover={{ y: -1 }}
        onClick={handleChipClick}
        {...(enableLongPressDrag ? longPressHandlers : {})}
        drag={dragging}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        whileDrag={{ scale: 1.08, zIndex: 100 }}
        className={`absolute left-1 right-1 rounded-md px-2 py-1 cursor-pointer group ${dragging ? 'ring-2 ring-amber-300/60 z-50 shadow-[0_8px_24px_rgba(233,195,73,0.4)]' : ''}`}
        style={{
          ...style,
          background: `${color}33`,
          borderLeft: `2px solid ${color}`,
          ...recurringBorder,
          // Lift the whole chip above sibling chips while the kebab menu
          // is open — otherwise the popover (which lives inside the chip)
          // can be hidden behind other activities further down the column.
          zIndex: menuOpen ? 40 : undefined,
          touchAction: dragging ? 'none' : undefined,
        }}
      >
        <div className="flex items-center gap-1 min-w-0 pr-5">
          <span className="text-[11px] font-semibold text-stone-100 truncate">{activity.titulo}</span>
          {gcalEnabled && activity.sync_status && (
            <ActividadSyncBadge actividadId={activity.id} status={activity.sync_status} />
          )}
        </div>
        <div className="text-[10px] text-stone-300/80 truncate pr-5">{sefirotLabel}</div>
        <button
          type="button"
          onClick={handleKebabClick}
          aria-label="Opciones"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center text-stone-300 hover:bg-black/30 transition-opacity ${
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
        >
          <MoreVertical size={12} />
        </button>
        {menu}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={menuContainerRef}
      layoutId={`event-${activity.id}`}
      variants={eventChip}
      initial="initial"
      animate="animate"
      exit="exit"
      whileHover={{ x: 1 }}
      onClick={(e) => { e.stopPropagation(); handleChipClick(); }}
      {...(enableLongPressDrag ? longPressHandlers : {})}
      drag={dragging}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      whileDrag={{ scale: 1.08, zIndex: 100 }}
      className={`relative rounded-sm px-1.5 py-0.5 cursor-pointer text-[10px] text-stone-100 group ${dragging ? 'ring-2 ring-amber-300/60 z-50 shadow-[0_8px_24px_rgba(233,195,73,0.4)]' : ''}`}
      style={{
        background: `${color}33`,
        borderLeft: `2px solid ${color}`,
        ...recurringBorder,
        zIndex: menuOpen ? 40 : undefined,
        touchAction: dragging ? 'none' : undefined,
      }}
    >
      <span className="flex items-center gap-1 min-w-0 pr-4">
        <span className="truncate">{activity.titulo}</span>
        {gcalEnabled && activity.sync_status && (
          <ActividadSyncBadge actividadId={activity.id} status={activity.sync_status} />
        )}
      </span>
      <button
        type="button"
        onClick={handleKebabClick}
        aria-label="Opciones"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`absolute top-0 right-0 w-4 h-4 rounded flex items-center justify-center text-stone-300 hover:bg-black/30 transition-opacity ${
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
        }`}
      >
        <MoreVertical size={10} />
      </button>
      {menu}
    </motion.div>
  );
}
