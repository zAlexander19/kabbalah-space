import { useState } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';

export function useKsaiToggle() {
  const auth = useAuth();
  const [saving, setSaving] = useState(false);

  async function setEnabled(enabled: boolean) {
    setSaving(true);
    try {
      const res = await apiFetch('/usuarios/me/ksai', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar');
      const data = await res.json();
      auth.updateUser?.({ ksai_enabled: data.ksai_enabled });
    } finally {
      setSaving(false);
    }
  }

  return { enabled: auth.user?.ksai_enabled ?? true, setEnabled, saving };
}
