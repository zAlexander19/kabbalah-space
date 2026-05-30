import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { GateError, GateReason } from './types';

interface OpenGateOptions {
  reason: GateReason;
  detail?: GateError;
}

interface PremiumGateContextValue {
  isOpen: boolean;
  reason: GateReason | null;
  detail: GateError | null;
  openGate: (options: OpenGateOptions) => void;
  closeGate: () => void;

  // Premium pricing modal (full /premium page in a popup)
  isPlansOpen: boolean;
  openPlans: () => void;
  closePlans: () => void;
}

const PremiumGateContext = createContext<PremiumGateContextValue | null>(null);

export function PremiumGateProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<GateReason | null>(null);
  const [detail, setDetail] = useState<GateError | null>(null);
  const [isPlansOpen, setIsPlansOpen] = useState(false);

  const openGate = useCallback((options: OpenGateOptions) => {
    setReason(options.reason);
    setDetail(options.detail ?? null);
    setIsOpen(true);
  }, []);

  const closeGate = useCallback(() => {
    setIsOpen(false);
    // Keep reason/detail until next open so exit animation can read them.
  }, []);

  const openPlans = useCallback(() => setIsPlansOpen(true), []);
  const closePlans = useCallback(() => setIsPlansOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, reason, detail, openGate, closeGate, isPlansOpen, openPlans, closePlans }),
    [isOpen, reason, detail, openGate, closeGate, isPlansOpen, openPlans, closePlans],
  );

  return (
    <PremiumGateContext.Provider value={value}>
      {children}
    </PremiumGateContext.Provider>
  );
}

export function useGate(): PremiumGateContextValue {
  const ctx = useContext(PremiumGateContext);
  if (ctx === null) {
    throw new Error('useGate must be used inside <PremiumGateProvider>');
  }
  return ctx;
}
