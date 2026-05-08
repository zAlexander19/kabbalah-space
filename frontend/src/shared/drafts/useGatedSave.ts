import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../auth';

export type GatedSave = {
  /** Call when the user clicks "Save". If anonymous, opens the LoginModal
   *  with triggeredBy=gated-save; if authenticated, opens the confirm dialog
   *  immediately. Idempotent while a save is in flight. */
  triggerSave: () => void;
  /** True when the confirm dialog should be visible. */
  isConfirming: boolean;
  /** True while the onSubmit callback is awaiting the network. */
  isSaving: boolean;
  /** Run the user's onSubmit. Closes the confirm dialog on success. */
  confirm: () => Promise<void>;
  /** Dismiss the confirm dialog without saving. */
  cancel: () => void;
};

/**
 * Wrap a save action with the gated flow:
 *   anonymous → open LoginModal(triggeredBy: 'gated-save') → on login,
 *               auto-open confirm dialog → user confirms → onSubmit()
 *   authenticated → open confirm dialog immediately → onSubmit()
 *
 * `onSubmit` should throw on failure; the caller is responsible for surfacing
 * the error message in its own UI (we don't display errors here so the caller
 * can format them in context).
 */
export function useGatedSave(onSubmit: () => Promise<void>): GatedSave {
  const { status, openLoginModal, gatedSaveSignal } = useAuth();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAfterLogin, setPendingAfterLogin] = useState(false);
  const lastSeenSignalRef = useRef(gatedSaveSignal);

  const triggerSave = useCallback(() => {
    if (isConfirming || isSaving) return; // dedup multi-clicks
    if (status === 'authenticated') {
      setIsConfirming(true);
    } else {
      setPendingAfterLogin(true);
      openLoginModal('gated-save');
    }
  }, [isConfirming, isSaving, status, openLoginModal]);

  // When a gated-save login completes, AuthContext bumps gatedSaveSignal.
  // Any hook instance whose triggerSave kicked off the flow will have
  // pendingAfterLogin=true and react by opening its confirm dialog.
  useEffect(() => {
    if (gatedSaveSignal !== lastSeenSignalRef.current && pendingAfterLogin && status === 'authenticated') {
      lastSeenSignalRef.current = gatedSaveSignal;
      setPendingAfterLogin(false);
      setIsConfirming(true);
    }
  }, [gatedSaveSignal, pendingAfterLogin, status]);

  const confirm = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSubmit();
      setIsConfirming(false);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, onSubmit]);

  const cancel = useCallback(() => {
    if (isSaving) return; // can't cancel mid-save
    setIsConfirming(false);
  }, [isSaving]);

  return { triggerSave, isConfirming, isSaving, confirm, cancel };
}
