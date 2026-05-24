import { motion } from 'framer-motion';

import { useAuth } from '../auth/AuthContext';
import { SubscriptionSection } from './SubscriptionSection';

const ease = [0.16, 1, 0.3, 1] as const;

interface CuentaPageProps {
  onNavigateToPremium: () => void;
}

export function CuentaPage({ onNavigateToPremium }: CuentaPageProps) {
  const auth = useAuth();

  if (auth.status !== 'authenticated' || !auth.user) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-10 text-center">
        <p className="text-stone-400">Iniciá sesión para ver tu cuenta.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="w-full max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-8"
    >
      <div className="bg-[#15181d] border border-stone-700/40 rounded-2xl p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-2">Perfil</p>
        <p className="text-stone-200 text-base font-medium">{auth.user.nombre}</p>
        <p className="text-stone-400 text-sm">{auth.user.email}</p>
        <p className="text-stone-500 text-[10px] uppercase tracking-[0.14em] mt-1">
          via {auth.user.provider === 'google' ? 'Google' : 'Email'}
        </p>
      </div>

      <SubscriptionSection onNavigateToPremium={onNavigateToPremium} />
    </motion.div>
  );
}
