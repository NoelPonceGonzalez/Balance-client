import { api } from '@/lib/api';

const PAGE = 2000;
const MAX_PAGES = 25;

/** Lee páginas hasta el final. Un servidor anterior no manda `complete` y la primera respuesta ya es toda la que sabe dar. */
export async function loadMovementPages<T>(params: URLSearchParams): Promise<{ rows: T[]; complete: boolean }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams(params);
    query.set('page', String(page));
    query.set('pageSize', String(PAGE));
    const data = await api<{ movements: T[]; complete?: boolean }>(`/api/movements?${query}`);
    rows.push(...(data.movements || []));
    if (data.complete !== false) return { rows, complete: true };
  }
  return { rows, complete: false };
}

/** El total de la cuenta. Si el servidor aún no cuenta, se suman las páginas que llegan. */
export async function movementCount(): Promise<number> {
  try {
    const data = await api<{ count: number }>('/api/movements/count');
    if (typeof data.count === 'number' && Number.isFinite(data.count)) return data.count;
  } catch {
    // El servidor publicado todavía no tiene la cuenta.
  }
  const all = await loadMovementPages<unknown>(new URLSearchParams());
  return all.rows.length;
}
