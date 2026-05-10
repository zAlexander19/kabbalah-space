export default function InicioMarquee() {
  return (
    <section aria-hidden className="relative py-10 my-12 border-y border-line bg-gold/[0.04] overflow-hidden">
      <div className="ks-marquee flex gap-12 whitespace-nowrap w-max">
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className="ks-serif italic text-2xl md:text-3xl text-gold/80 flex items-center gap-12">
            El conocimiento del universo empieza por adentro <span className="text-gold">✦</span>
          </span>
        ))}
      </div>
    </section>
  );
}
