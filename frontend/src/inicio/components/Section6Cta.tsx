import InicioSection from './InicioSection';
import { useAuth } from '../../auth';

type Props = {
  onEnterEspejo: () => void;
};

/**
 * Section 6 — CTA. Two buttons:
 *  - "Entrar al Árbol de la Vida" always visible; calls onEnterEspejo
 *    which the App turns into setActiveView('espejo').
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
          className="px-7 py-3.5 rounded-xl bg-amber-300/15 hover:bg-amber-300/25 active:bg-amber-300/30 border border-amber-300/40 text-amber-100 text-sm tracking-[0.14em] uppercase transition-colors shadow-[0_0_18px_rgba(233,195,73,0.18)]"
        >
          Entrar al Árbol de la Vida
        </button>
        {showLogin && (
          <button
            type="button"
            onClick={() => auth.openLoginModal('manual')}
            className="px-7 py-3.5 rounded-xl border border-stone-700/60 text-stone-300 hover:text-amber-100 hover:border-amber-300/40 text-sm tracking-[0.14em] uppercase transition-colors"
          >
            Iniciar sesión
          </button>
        )}
      </div>
    </InicioSection>
  );
}
