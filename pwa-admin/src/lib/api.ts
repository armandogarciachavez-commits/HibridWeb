const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem('auth_token') ?? '';
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...extra,
  };
}

/**
 * Decodifica el payload de un JWT de forma segura.
 * Maneja el padding base64url correctamente.
 * Retorna null si el token es inválido o malformado.
 */
export function getTokenPayload(): Record<string, unknown> | null {
  try {
    const token = localStorage.getItem('auth_token') ?? '';
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // JWT usa base64url (sin padding) → convertir a base64 estándar
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded  = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/**
 * Retorna true si el token en localStorage existe y no ha expirado.
 * Si el token no tiene campo `exp`, se considera válido.
 */
export function isTokenValid(): boolean {
  const token = localStorage.getItem('auth_token');
  if (!token) return false;                          // Sin token → inválido

  const payload = getTokenPayload();
  if (!payload) return true;                         // Token opaco de Sanctum (no JWT) → válido
  if (typeof payload.exp !== 'number') return true;  // JWT sin expiración → válido
  return payload.exp * 1000 > Date.now();            // JWT con exp → verificar fecha
}

/** Elimina las credenciales del localStorage. */
function clearAuth(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('user_name');
}

/**
 * Wrapper centralizado para todas las llamadas a la API.
 * - Inyecta automáticamente el token Bearer.
 * - Si el servidor responde 401 (token expirado o revocado),
 *   limpia la sesión y recarga la app para redirigir al login.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers({
    ...authHeaders(),
    ...(options.headers as Record<string, string> ?? {}),
  });

  if (options.body instanceof FormData) {
    headers.delete('Content-Type');
  }

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuth();
    window.location.reload(); // App.tsx detecta ausencia de token → redirige a /login
  }

  return response;
}
