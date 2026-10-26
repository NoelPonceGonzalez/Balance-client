export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Vacío en local: las peticiones van a /api y Vite las manda a localhost. En Vercel apunta a Amazon. */
function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  if (!base || /^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('pat_token');
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...options, headers });
  } catch {
    throw new ApiError('No hay conexión con el servidor. Comprueba que la API esté en marcha.', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || 'No se ha podido completar.', response.status, data.code);
  }
  return data as T;
}
