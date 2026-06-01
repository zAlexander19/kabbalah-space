import { Plus } from 'lucide-react';

type Props = {
  onClick: () => void;
};

export default function ActivityFab({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Crear actividad"
      className="fixed bottom-6 right-4 z-30 w-14 h-14 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 text-stone-900 shadow-[0_8px_24px_rgba(233,195,73,0.45)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
    >
      <Plus size={28} />
    </button>
  );
}
