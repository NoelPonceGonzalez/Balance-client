export function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return <span className="block h-10 w-28" />;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const width = 112;
  const height = 40;
  const path = clean
    .map((value, index) => {
      const x = (index / (clean.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 6) - 3;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden>
      <path d={path} fill="none" stroke={up ? '#16c784' : '#ea3943'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
