export const SESSION_STORAGE_KEY = 'flakecheck.session_token';

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {}
}

export function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function apiUrl(path: string): string {
  const baseUrl = (import.meta.env.VITE_GATEWAY_URL as string | undefined)?.replace(/\/+$/, '');
  if (!baseUrl) return path;
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}


export async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function friendlyResponseError(response: Response, fallback: string): Error {
  const messages: Record<number, string> = {
    400: 'Please check the information you entered and try again.',
    401: 'Your session or sign-in details could not be verified.',
    403: 'You do not have permission to perform this action.',
    404: 'That resource could not be found.',
    429: 'Too many requests. Please wait a moment and try again.',
    500: 'Something went wrong on our side. Please try again.',
    502: 'The service is temporarily unavailable. Please try again.',
    503: 'The service is temporarily unavailable. Please try again.',
  };
  const retryAfter = response.status === 429 ? Number(response.headers.get('Retry-After')) : NaN;
  const message = response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
    ? `Too many attempts. Please wait ${retryAfter} seconds and try again.`
    : messages[response.status] ?? fallback;
  const error = new Error(message);
  error.name = 'UserFacingError';
  return error;
}

export function userFacingMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.name === 'UserFacingError' ? error.message : fallback;
}
