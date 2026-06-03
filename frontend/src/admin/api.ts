import { apiFetch } from '../auth/api';

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === 'string') return body.detail;
  } catch { /* ignore */ }
  return `HTTP ${res.status}`;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

// ---------- Tipos ----------
export interface PreguntaAdmin {
  id: string;
  sefira_id: string;
  texto_pregunta: string;
  orden: number;
  fecha_creacion: string | null;
}

export interface UsuarioAdmin {
  id: string;
  nombre: string;
  email: string;
  provider: string;
  is_admin: boolean;
  is_premium: boolean;
  fecha_creacion: string | null;
}

export interface UsuariosList {
  total: number;
  items: UsuarioAdmin[];
}

export interface AdminStats {
  usuarios: {
    total: number; nuevos_hoy: number; nuevos_semana: number; nuevos_mes: number;
    por_provider: Record<string, number>; premium: number;
  };
  actividad: {
    reflexiones_total: number; respuestas_total: number; actividades_total: number;
    usuarios_activos_7d: number; usuarios_activos_30d: number; gcal_sync_activos: number;
  };
  premium: { activos: number; trial: number; cancelados: number; por_plan: Record<string, number>; };
}

// ---------- Preguntas ----------
export async function listPreguntas(sefiraId: string): Promise<PreguntaAdmin[]> {
  return json(await apiFetch(`/admin/preguntas/${sefiraId}`));
}
export async function createPregunta(sefiraId: string, texto: string): Promise<PreguntaAdmin> {
  return json(await apiFetch('/admin/preguntas', {
    method: 'POST', body: JSON.stringify({ sefira_id: sefiraId, texto }),
  }));
}
export async function updatePregunta(id: string, texto: string): Promise<PreguntaAdmin> {
  return json(await apiFetch(`/admin/preguntas/${id}`, {
    method: 'PATCH', body: JSON.stringify({ texto }),
  }));
}
export async function deletePregunta(id: string): Promise<void> {
  const res = await apiFetch(`/admin/preguntas/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}
export async function reorderPreguntas(sefiraId: string, ids: string[]): Promise<void> {
  const res = await apiFetch(`/admin/preguntas/${sefiraId}/orden`, {
    method: 'PUT', body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

// ---------- Usuarios ----------
export async function listUsuarios(search = '', limit = 50, offset = 0): Promise<UsuariosList> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search) qs.set('search', search);
  return json(await apiFetch(`/admin/usuarios?${qs.toString()}`));
}
export async function setAdmin(userId: string, makeAdmin: boolean): Promise<UsuarioAdmin> {
  return json(await apiFetch(`/admin/usuarios/${userId}/admin`, {
    method: makeAdmin ? 'POST' : 'DELETE',
  }));
}
export async function setPremium(userId: string, grant: boolean): Promise<UsuarioAdmin> {
  return json(await apiFetch(`/admin/usuarios/${userId}/premium`, {
    method: grant ? 'POST' : 'DELETE',
  }));
}
export async function deleteUsuario(userId: string): Promise<void> {
  const res = await apiFetch(`/admin/usuarios/${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}

// ---------- Stats ----------
export async function getStats(): Promise<AdminStats> {
  return json(await apiFetch('/admin/stats'));
}
