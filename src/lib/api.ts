export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await apiOnce<T>(path, options);
    } catch (error) {
      last = error;
      const status = error instanceof ApiError ? error.status : 0;
      if (status !== 0 && status !== 500) throw error;
      if (attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  throw last;
}

async function apiOnce<T>(path: string, options: RequestInit): Promise<T> {
  const token = localStorage.getItem('pat_token');
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError('No hay conexión con el servidor. Comprueba que la API esté en marcha.', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || 'No se ha podido completar.', response.status, data.code);
  }
  return data as T;
}
