import { findBrand } from '@/lib/brands';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function BrandLogo({ name, size = 40 }: { name: string; size?: number }) {
  if (!name.trim()) {
    return <span className="shrink-0 rounded-2xl bg-slate-100 dark:bg-slate-800" style={{ width: size, height: size }} aria-hidden />;
  }
  const brand = findBrand(name);
  if (brand) {
    return <img src={`/brands/${brand.id}.${brand.image}`} alt="" width={size} height={size} className="shrink-0 rounded-2xl bg-white object-cover shadow-sm" />;
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl bg-slate-700 font-black text-white"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.32) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
