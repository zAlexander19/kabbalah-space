export {
  readDraft,
  writeDraft,
  clearDraft,
  wipeAll,
  adoptAnonymous,
} from './storage';

export { useDraftPersistence, type DraftPersistence } from './useDraftPersistence';
export { useGatedSave, type GatedSave } from './useGatedSave';
export { ConfirmSaveDialog } from './ConfirmSaveDialog';
export { PendingDraftBadge } from './PendingDraftBadge';
