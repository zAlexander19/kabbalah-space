import { useEffect } from 'react';

let lockCount = 0;
let originalOverflow: string | null = null;

function acquire() {
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

function release() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow ?? '';
    originalOverflow = null;
  }
}

/**
 * Locks `document.body` scroll while `active` is true.
 *
 * Uses a process-wide counter so that overlapping modals (PremiumGate over
 * PremiumPlansModal, ConfirmSaveDialog over AnswersGridModal, etc.) don't
 * stomp on each other's saved value — body stays locked as long as any
 * consumer needs it, and only the FIRST acquire snapshots the original
 * overflow style, so unmount order no longer matters.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    acquire();
    return release;
  }, [active]);
}
