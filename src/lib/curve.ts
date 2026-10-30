/** Pendientes de una cúbica monótona, las mismas para el trazo y para el dedo. */
export function curveSlopes(xy: [number, number][]): { h: number[]; m: number[] } {
  const n = xy.length;
  const h = xy.slice(1).map(([x], index) => x - xy[index][0]);
  const s = xy.slice(1).map(([, y], index) => (h[index] ? (y - xy[index][1]) / h[index] : 0));
  const m = xy.map((_, index) => {
    if (index === 0) return s[0] ?? 0;
    if (index === n - 1) return s[n - 2] ?? 0;
    const s0 = s[index - 1];
    const s1 = s[index];
    if (s0 * s1 <= 0) return 0;
    const p = (s0 * h[index] + s1 * h[index - 1]) / (h[index - 1] + h[index]);
    return Math.sign(s0) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) * 2;
  });
  return { h, m };
}

export function smoothPath(xy: [number, number][]): string {
  if (xy.length < 2) return '';
  const { h, m } = curveSlopes(xy);
  let d = `M${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
  for (let index = 0; index < xy.length - 1; index += 1) {
    const [x0, y0] = xy[index];
    const [x1, y1] = xy[index + 1];
    const step = h[index] / 3;
    d += ` C${(x0 + step).toFixed(1)} ${(y0 + m[index] * step).toFixed(1)} ${(x1 - step).toFixed(1)} ${(y1 - m[index + 1] * step).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

/** Punto de la curva justo bajo el dedo, para que el recorrido no salte de dato en dato. */
export function placeOnCurve(xy: [number, number][], x: number, height: number, bottom: number, top: number): { x: number; y: number; eur: number } {
  const { h, m } = curveSlopes(xy);
  const clamped = Math.min(Math.max(x, xy[0][0]), xy[xy.length - 1][0]);
  let index = 0;
  while (index < xy.length - 2 && xy[index + 1][0] < clamped) index += 1;
  while (index < xy.length - 2 && h[index] <= 0) index += 1;
  const [x0, y0] = xy[index];
  const [x1, y1] = xy[index + 1];
  const span = h[index] || 1;
  const t = Math.min(1, Math.max(0, (clamped - x0) / span));
  const step = span / 3;
  const u = 1 - t;
  const y = u * u * u * y0 + 3 * u * u * t * (y0 + m[index] * step) + 3 * u * t * t * (y1 - m[index + 1] * step) + t * t * t * y1;
  const eur = bottom + ((height - y) / height) * ((top - bottom) || 1);
  return { x: x0 + t * span, y, eur };
}
