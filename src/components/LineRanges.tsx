import { cn } from '@/lib/utils';

export const LINE_RANGES = [
  { id: '1D', label: '1d', days: 1 },
  { id: '1S', label: '1s', days: 7 },
  { id: '1M', label: '1m', days: 30 },
  { id: '1A', label: '1a', days: 365 },
  { id: 'MAX', label: 'max', days: null },
] as const;

export type LineRangeId = (typeof LINE_RANGES)[number]['id'];

export function lineDays(range: LineRangeId): number | null {
  const days = LINE_RANGES.find((item) => item.id === range)?.days;
  return days == null ? null : days;
}

/** Corta la línea al tramo. Max deja el histórico entero. Si en el tramo solo queda un día, conserva el anterior para que se vea el salto. */
export function inLineRange<T extends { day: string }>(points: T[], range: LineRangeId): T[] {
  const days = lineDays(range);
  if (days == null || points.length < 2) return points;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const kept = points.filter((point) => point.day.slice(0, 10) >= cutoff);
  if (kept.length >= 2) return kept;
  if (kept.length === 1) {
    const index = points.findIndex((point) => point.day === kept[0].day);
    if (index > 0) return [points[index - 1], kept[0]];
  }
  return points.slice(-2);
}

export function LineRangeTabs({ value, onChange }: { value: LineRangeId; onChange: (next: LineRangeId) => void }) {
  return (
    <div className="mt-2 flex justify-between gap-1">
      {LINE_RANGES.map((item) => {
        const on = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(item.id)}
            className={cn('whitespace-nowrap px-0.5 py-1 text-[13px] transition-colors sm:text-[15px]', on ? 'font-semibold text-slate-950 dark:text-white' : 'font-medium text-slate-300 dark:text-slate-600')}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
