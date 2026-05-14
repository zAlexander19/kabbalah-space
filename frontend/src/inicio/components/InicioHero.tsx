type Props = {
  onEnterEspejo: () => void;
};

export default function InicioHero({ onEnterEspejo }: Props) {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-32 md:pt-48 pb-24 px-6">
      <div className="relative z-10 text-center max-w-3xl mx-auto">
        <div className="mb-8 ks-blur-in">
          <span className="ks-pill">ALEPH 1</span>
        </div>

        <h1 className="ks-serif ks-name-reveal text-6xl md:text-8xl lg:text-9xl font-light italic text-ink-glow leading-[0.95] mb-6">
          Kabbalah Space
        </h1>

        <p className="ks-serif ks-blur-in italic text-2xl md:text-4xl text-gold mb-10" style={{ animationDelay: '0.4s' }}>
          Tu espacio para crecer.
        </p>

        <p className="ks-body ks-blur-in max-w-xl mx-auto mb-14" style={{ animationDelay: '0.7s' }}>
          Un espacio donde te podrás conocer, donde podrás ver lo que estás siendo. Organizá tus energías organizando tu tiempo en un calendario en el que podrás diferenciar tus actividades por dimensiones.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center ks-blur-in" style={{ animationDelay: '1s' }}>
          <button type="button" onClick={onEnterEspejo} className="ks-btn-primary">
            Entrar al Árbol →
          </button>
          <a href="#premisa" className="ks-btn-ghost">
            Cómo funciona ↓
          </a>
        </div>
      </div>
    </section>
  );
}
