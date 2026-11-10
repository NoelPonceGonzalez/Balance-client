import { api } from '@/lib/api';

interface Priced {
  quantity: number;
  source: string;
  quoteId: string;
  unit: number;
}

interface Story {
  series?: { at: string; eur: number }[];
}

function dayOf(stamp: string): string {
  return stamp.slice(0, 10);
}

function priceOn(days: Map<string, number>, day: string): number | null {
  if (days.has(day)) return days.get(day) || null;
  const known = [...days.keys()].sort();
  const prior = known.filter((item) => item <= day).pop();
  return (prior ? days.get(prior) : days.get(known[0] || '')) || null;
}

/** Línea de un mes con el precio real de cada posición, para que no se quede plana ni en cero. */
export async function shapeLine(rows: Priced[]): Promise<{ day: string; eur: number }[]> {
  const linked = rows.filter((row) => (row.source === 'coingecko' || row.source === 'yahoo') && row.quoteId && row.quantity > 0 && row.unit > 0);
  if (!linked.length) return [];
  const stories = await Promise.all(linked.map(async (row) => {
    const kind = row.source === 'coingecko' ? 'crypto' : 'stock';
    try {
      const data = await api<Story>(`/api/market/story?kind=${kind}&key=${encodeURIComponent(`${row.source}:${row.quoteId}`)}&name=${encodeURIComponent(row.quoteId)}&days=30`);
      const days = new Map<string, number>();
      for (const point of data.series || []) {
        if (point.eur > 0) days.set(dayOf(point.at), point.eur);
      }
      return { row, days };
    } catch {
      return { row, days: new Map<string, number>() };
    }
  }));
  const dates = new Set<string>();
  for (const item of stories) for (const day of item.days.keys()) dates.add(day);
  const ordered = [...dates].sort();
  if (ordered.length < 2) return [];
  return ordered.map((day) => {
    const eur = stories.reduce((sum, item) => sum + (priceOn(item.days, day) ?? item.row.unit) * item.row.quantity, 0);
    return { day, eur: Math.round(eur * 100) / 100 };
  });
}
