const PHRASES = [
  'El conocimiento del universo empieza conociéndose a uno mismo.',
  'El verdadero conocimiento es el conocedor.',
  'Detrás del amor está el conocimiento.',
] as const;

// Cycle the 3 phrases enough times that 50% of the track width covers
// well over a viewport, so the translateX(-50%) loop is seamless.
const REPEATS = 4;

export default function InicioMarquee() {
  return (
    <section aria-hidden className="relative py-10 my-12 border-y border-line bg-gold/[0.04] overflow-hidden">
      <div className="ks-marquee flex gap-12 whitespace-nowrap w-max">
        {Array.from({ length: REPEATS }).flatMap((_, cycle) =>
          PHRASES.map((phrase, i) => (
            <span
              key={`${cycle}-${i}`}
              className="ks-serif italic text-2xl md:text-3xl text-gold/80 flex items-center gap-12"
            >
              {phrase} <span className="text-gold">✦</span>
            </span>
          ))
        )}
      </div>
    </section>
  );
}
