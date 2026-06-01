// frontend/src/calendar/views/WeekViewMobile.tsx
//
// Vista semana mobile: reusa WeekView desktop con scroll horizontal forzado
// (mobile no entran 7 columnas + columna de horas en 375px, así que el container
// tiene min-width que fuerza scroll). Habilita long-press drag para mover
// actividades con el dedo.
import WeekView from './WeekView';
import type { Activity } from '../types';

type Props = {
  date: Date;
  activities: Activity[];
  onSlotClick?: (start: Date, end: Date) => void;
  onEventClick?: (a: Activity) => void;
  onEventEdit?: (a: Activity) => void;
  onEventDelete?: (a: Activity) => void;
  onEventMove?: (id: string, newStart: Date, newEnd: Date) => void;
  gcalEnabled?: boolean;
  pendingSlot?: { start: Date; end: Date } | null;
};

export default function WeekViewMobile(props: Props) {
  return (
    <div className="w-full">
      <WeekView {...props} enableLongPressDrag={true} hourColumnWidth={40} />
    </div>
  );
}
