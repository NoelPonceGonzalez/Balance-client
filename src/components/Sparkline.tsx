import { smoothPath } from '@/lib/curve';

export function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return <span className="block h-8 w-16 max-w-[36%] shrink-0 sm:h-10 sm:w-28 sm:max-w-none" />;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const width = 112;
  const height = 40;
  const xy: [number, number][] = clean.map((value, index) => {
    const x = (index / (clean.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 6) - 3;
    return [x, y];
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-16 max-w-[36%] shrink-0 sm:h-10 sm:w-28 sm:max-w-none" aria-hidden>
      <path d={smoothPath(xy)} fill="none" stroke={up ? '#16c784' : '#ea3943'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
