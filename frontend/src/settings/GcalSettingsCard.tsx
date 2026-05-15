import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../auth';
import { useGcalStatus, useGcalSync } from '../sync';

const ease = [0.16, 1, 0.3, 1] as const;

export default function GcalSettingsCard() {
  const auth = useAuth();
  const { status, refetch } = useGcalStatus(auth.status === 'authenticated');
  const { connect, disconnect, backfill, working } = useGcalSync();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const isGoogleUser = auth.status === 'authenticated' && auth.user?.provider === 'google';
  const isAnonymous = auth.status === 'anonymous';
  const enabled = status?.enabled === true;
  const errorCount = status?.error_count ?? 0;
  const pendingCount = status?.pending_count ?? 0;
  const backfillInProgress = enabled && pendingCount > 0;

  return (
    <section className="ks-module-card p-7">
      <p className="ks-eyebrow text-gold mb-3">Google Calendar</p>
      <h2 className="ks-serif text-2xl text-ink-glow font-light mb-2">
        Sincronizar tus actividades
      </h2>
      <p className="ks-body text-sm mb-6">
        Las actividades que crees aparecerán en un calendario dedicado llamado
        "Kabbalah Space" en tu Google Calendar.
      </p>

      {(isAnonymous || (!isGoogleUser && auth.status === 'authenticated')) && (
        <div className="opacity-50">
          <p className="text-sm text-stone-400 mb-4">
            {isAnonymous
              ? 'Necesitás iniciar sesión con Google para activar sync.'
              : 'Tu cuenta es de email/contraseña. Vinculá una cuenta Google para activar sync.'}
          </p>
          <button type="button" disabled className="ks-btn-primary opacity-40 cursor-not-allowed">
            Vinculá tu cuenta de Google
          </button>
        </div>
      )}

      {isGoogleUser && !enabled && (
        <button
          type="button"
          onClick={connect}
          disabled={working}
          className="ks-btn-primary"
        >
          {working ? 'Conectando...' : 'Activar sync con Google Calendar'}
        </button>
      )}

      {isGoogleUser && enabled && backfillInProgress && (
        <div>
          <p className="text-sm text-ink mb-3">
            Sincronizando {pendingCount} {pendingCount === 1 ? 'actividad' : 'actividades'}…
          </p>
          <div className="w-full h-1 bg-stone-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gold"
              initial={{ width: '15%' }}
              animate={{ width: '85%' }}
              transition={{ duration: 5, ease, repeat: Infinity, repeatType: 'reverse' }}
            />
          </div>
          {status?.last_sync_at && (
            <p className="ks-eyebrow text-stone-500 mt-3">
              Última actividad subida: {formatRelative(status.last_sync_at)}
            </p>
          )}
        </div>
      )}

      {isGoogleUser && enabled && !backfillInProgress && (
        <div>
          <p className="ks-body text-sm text-gold mb-2">
            ✓ Sincronizado · {status?.last_sync_at
              ? `última actividad subida ${formatRelative(status.last_sync_at)}`
              : 'sin actividad reciente'}
          </p>
          <p className="ks-body text-sm mb-5">
            Calendario: <span className="text-ink-glow">"{status?.calendar_name ?? 'Kabbalah Space'}"</span> en tu Google Calendar
          </p>

          {errorCount > 0 && (
            <div className="mb-5 p-3 rounded-md border border-amber-500/40 bg-amber-500/10">
              <p className="text-sm text-amber-200">
                {errorCount} {errorCount === 1 ? 'actividad no sincronizó' : 'actividades no sincronizaron'}.
                <button
                  type="button"
                  onClick={() => { void backfill().then(refetch); }}
                  className="underline ml-2 text-amber-100"
                >
                  Reintentar
                </button>
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => { void backfill().then(refetch); }} className="ks-btn-ghost">
              Re-sincronizar todo
            </button>
            <button type="button" onClick={() => setConfirmingDisconnect(true)} className="ks-btn-ghost">
              Desconectar Google
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {confirmingDisconnect && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-bg-deep/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setConfirmingDisconnect(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.22, ease }}
              onClick={(e) => e.stopPropagation()}
              className="ks-module-card p-7 max-w-md w-full"
            >
              <h3 className="ks-serif text-xl text-ink-glow mb-3">¿Desconectar Google Calendar?</h3>
              <p className="ks-body text-sm mb-6">
                Borraremos el calendario "Kabbalah Space" de tu Google. Tus actividades
                en Kabbalah Space se conservan.
              </p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setConfirmingDisconnect(false)} className="ks-btn-ghost">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setConfirmingDisconnect(false);
                    await disconnect();
                    await refetch();
                  }}
                  className="ks-btn-primary"
                >
                  Sí, desconectar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'hace un instante';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
