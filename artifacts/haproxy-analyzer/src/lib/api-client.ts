const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const API_BASE = `${BASE}/api`;

function getToken(): string | null {
  try { return localStorage.getItem('msb-token'); } catch { return null; }
}

export function setToken(token: string) {
  try { localStorage.setItem('msb-token', token); } catch {}
}

export function clearToken() {
  try { localStorage.removeItem('msb-token'); } catch {}
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function apiGet<T = unknown>(path: string) {
  return apiRequest<T>(path, { method: 'GET' });
}

export function apiPost<T = unknown>(path: string, body: unknown) {
  return apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPut<T = unknown>(path: string, body: unknown) {
  return apiRequest<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

export function apiDelete<T = unknown>(path: string) {
  return apiRequest<T>(path, { method: 'DELETE' });
}
