export function formatPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value);
}

export function formatAgo(iso: string | null | undefined): string {
  if (!iso) return 'sin lectura';
  const delta = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < 0) return 'ahora';
  const seconds = Math.round(delta / 1000);
  if (seconds < 15) return 'ahora';
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return formatDay(iso);
}

export function formatEur(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

export function formatSignedEur(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = formatEur(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(value));
  if (value > 0) return `+${abs} %`;
  if (value < 0) return `−${abs} %`;
  return `${abs} %`;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(value);
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function tone(value: number | null | undefined): string {
  if (value == null || value === 0) return 'text-slate-500 dark:text-slate-400';
  return value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
}
