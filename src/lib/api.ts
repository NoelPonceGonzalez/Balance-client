export function keepGate(gate: string | undefined) {
  if (!gate) return;
  sessionStorage.setItem('pat_gate', gate);
  sessionStorage.setItem('pat_open', '1');
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const writeListeners = new Set<() => void>();

/** Avisa tras cada escritura que llega al servidor (POST/PUT/PATCH/DELETE): lib/query.ts vacía su caché. */
export function onApiWrite(listener: () => void): () => void {
  writeListeners.add(listener);
  return () => { writeListeners.delete(listener); };
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await apiOnce<T>(path, options);
    } catch (error) {
      last = error;
      const status = error instanceof ApiError ? error.status : 0;
      if ((status !== 0 && status !== 500) || (error instanceof ApiError && error.code === 'timeout')) throw error;
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
  const gate = sessionStorage.getItem('pat_gate');
  if (gate) headers.set('X-Balance-Gate', gate);
  const signal = options.signal ?? AbortSignal.timeout(options.body ? 45_000 : 20_000);
  let response: Response;
  try {
    response = await fetch(path, { ...options, headers, signal });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new ApiError(timedOut ? 'El servidor ha tardado demasiado.' : 'No hay conexión con el servidor. Comprueba que la API esté en marcha.', 0, timedOut ? 'timeout' : 'offline');
  }
  const method = (options.method || 'GET').toUpperCase();
  // Con respuesta (correcta o no) la escritura pudo aplicarse: nada guardado antes vale ya.
  if (method !== 'GET' && method !== 'HEAD') writeListeners.forEach((listener) => listener());
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.code === 'lock') {
      sessionStorage.removeItem('pat_gate');
      window.dispatchEvent(new Event('pat-lock'));
    }
    throw new ApiError(data.error || 'No se ha podido completar.', response.status, data.code);
  }
  return data as T;
}
