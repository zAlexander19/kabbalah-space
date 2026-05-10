import InicioSection from './InicioSection';
import { useAuth } from '../../auth';

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Section 6 — CTA. Two buttons:
 *  - "Entrar al Árbol de la Vida" always visible; calls onEnterEspejo
 *    which the App turns into setActiveView('espejo'). On hover an
 *    accent-gradient ring slides behind the button.
 *  - "Iniciar sesión" only renders when the user is anonymous; opens the
 *    LoginModal with triggeredBy 'manual' (no draft to flush).
 */
export default function Section6Cta({ onEnterEspejo }: Props) {
  const auth = useAuth();
  const showLogin = auth.status === 'anonymous';

  return (
    <InicioSection className="text-center">
      <div className="flex flex-col md:flex-row items-center justify-center gap-4">
        <button
          type="button"
          onClick={onEnterEspejo}
          className="group relative px-7 py-3.5 rounded-xl text-amber-100 text-sm tracking-[0.14em] uppercase transition-colors"
        >
          {/* Hover-revealed accent gradient ring */}
          <span
            aria-hidden
            className="accent-gradient absolute -inset-[2px] rounded-[14px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          />
          {/* Solid inner pill so the gradient reads as a ring */}
          <span className="relative block bg-stone-950/85 backdrop-blur-md border border-amber-300/40 rounded-xl px-7 py-3.5 -mx-7 -my-3.5">
            Entrar al Árbol de la Vida
          </span>
        </button>

        {showLogin && (
          <button
            type="button"
            onClick={() => auth.openLoginModal('manual')}
            className="group relative px-7 py-3.5 rounded-xl text-stone-300 hover:text-amber-100 text-sm tracking-[0.14em] uppercase transition-colors"
          >
            <span
              aria-hidden
              className="accent-gradient absolute -inset-[2px] rounded-[14px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            />
            <span className="relative block bg-stone-950/85 backdrop-blur-md border border-stone-700/60 group-hover:border-transparent rounded-xl px-7 py-3.5 -mx-7 -my-3.5 transition-colors">
              Iniciar sesión
            </span>
          </button>
        )}
      </div>
    </InicioSection>
  );
}
