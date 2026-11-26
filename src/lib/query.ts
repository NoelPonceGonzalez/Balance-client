/**
 * Caché de lecturas GET (Bloque B · base de rendimiento).
 *
 * - Deduplica: dos pantallas que piden lo mismo a la vez comparten una sola petición.
 * - Reutiliza: una respuesta reciente (maxAge) se devuelve sin red; `peek` la da al instante para pintar
 *   lo que ya se sabía mientras se revalida.
 * - Invalida: cualquier escritura (POST/PUT/PATCH/DELETE) que pase por `api()` vacía la caché entera, así
 *   nunca se muestra un saldo o una posición de antes de un cambio propio.
 * - No inventa frescura: `ageOf` dice cuánto tiene cada dato para que la pantalla lo diga si es viejo.
 */
import { api, onApiWrite } from './api';

interface Entry {
  value?: unknown;
  at: number;
  inflight?: Promise<unknown>;
  epoch: number;
}

const store = new Map<string, Entry>();
let epoch = 0;
const resetListeners = new Set<() => void>();

function currentOwner(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem('pat_token');
  } catch {
    return null;
  }
}
let owner = currentOwner();

function reset() {
  epoch += 1;
  store.clear();
  resetListeners.forEach((listener) => listener());
}

/** Cada usuario (sesión) tiene su caché: si cambia la sesión, lo guardado se olvida antes de leer nada. */
export function ensureOwner() {
  const now = currentOwner();
  if (now !== owner) {
    owner = now;
    reset();
  }
}

/** Avisa cuando la caché se vacía (escritura o cambio de sesión): para memorias propias de cada pantalla. */
export function onCacheReset(listener: () => void): () => void {
  resetListeners.add(listener);
  return () => { resetListeners.delete(listener); };
}

/** Contador de vaciados: una carga que empezó antes de un vaciado no debe guardarse. */
export function cacheEpoch(): number {
  ensureOwner();
  return epoch;
}

onApiWrite(reset);

/** Lo último guardado para `path`, si no supera `maxAge` ms (por defecto, cualquier edad). */
export function peek<T>(path: string, maxAge = Infinity): T | undefined {
  ensureOwner();
  const entry = store.get(path);
  if (!entry || entry.value === undefined || Date.now() - entry.at > maxAge) return undefined;
  return entry.value as T;
}

/** Milisegundos desde que se guardó `path` (null si no hay nada). */
export function ageOf(path: string): number | null {
  ensureOwner();
  const entry = store.get(path);
  return entry && entry.value !== undefined ? Date.now() - entry.at : null;
}

/**
 * GET con caché. Si hay una respuesta de menos de `maxAge` ms, se devuelve sin red (salvo `force`).
 * Si ya hay una petición en vuelo para la misma ruta, se comparte.
 */
export function cachedApi<T>(path: string, { maxAge = 0, force = false }: { maxAge?: number; force?: boolean } = {}): Promise<T> {
  ensureOwner();
  const entry = store.get(path);
  if (!force && entry?.value !== undefined && Date.now() - entry.at <= maxAge) return Promise.resolve(entry.value as T);
  if (entry?.inflight) return entry.inflight as Promise<T>;
  const started = epoch;
  const inflight = api<T>(path).then(
    (value) => {
      // Si hubo una escritura mientras volaba, la respuesta puede ser anterior al cambio: no se guarda.
      if (epoch === started) store.set(path, { value, at: Date.now(), epoch });
      // Si no, solo se quita su propia entrada: una lectura nueva (posterior al vaciado) no se toca.
      else if (store.get(path)?.inflight === inflight) store.delete(path);
      return value;
    },
    (error: unknown) => {
      const current = store.get(path);
      if (current?.inflight === inflight) {
        if (current.value === undefined) store.delete(path);
        else store.set(path, { value: current.value, at: current.at, epoch: current.epoch });
      }
      throw error;
    },
  );
  store.set(path, { value: entry?.value, at: entry?.at ?? 0, inflight, epoch });
  return inflight;
}

/** Olvida las rutas que empiezan por `prefix` (para refrescos explícitos). */
export function invalidate(prefix: string) {
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
}
