export default function EmptyState() {
  return (
    <div className="text-center opacity-60 flex flex-col items-center justify-center h-full min-h-[400px] px-6">
      <span className="material-symbols-outlined text-5xl mb-6 font-light">touch_app</span>
      <p className="text-stone-400 text-sm font-mono uppercase tracking-[0.15em] leading-relaxed">
        Selecciona una emanación en el árbol<br/>para explorar su sabiduría
      </p>
      <p className="text-[10px] text-stone-500 mt-6 italic max-w-xs">
        Las cards flotantes muestran fragmentos de tus reflexiones, ordenados por score IA.
      </p>
    </div>
  );
}
