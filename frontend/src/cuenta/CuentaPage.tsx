import { motion } from 'framer-motion';

import { useAuth } from '../auth/AuthContext';
import { EmailPreferencesSection } from './EmailPreferencesSection';
import { ProfileSection } from './ProfileSection';
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
      <ProfileSection />

      <SubscriptionSection onNavigateToPremium={onNavigateToPremium} />

      <EmailPreferencesSection />
    </motion.div>
  );
}
