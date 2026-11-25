import { useEffect, useId, useRef, useState } from 'react';

/**
 * Capa de refracción del material Liquid Glass (estática, sin animaciones).
 *
 * El canto del cristal se modela como una superficie curva (perfil "squircle convexo") y la
 * luz que lo atraviesa se desvía según la ley de Snell (vidrio n = 1,5): el fondo se curva
 * cerca del perímetro y el centro queda limpio. Cada color se desvía un poco distinto, lo
 * que deja un leve borde irisado como el del cristal real.
 *
 * Se aplica con un filtro SVG (feDisplacementMap) dentro de backdrop-filter, sólo sobre el
 * fondo: el contenido del componente va en otra capa y nunca se deforma. Sólo Chromium
 * admite filtros SVG en backdrop-filter; el resto de navegadores usan el blur de CSS.
 *
 * El mapa de desplazamiento se calcula una sola vez por tamaño (y queda en caché): sin canvas,
 * sin bucles de render y sin requestAnimationFrame.
 *
 * Ajustes (variables CSS en el elemento .liquid-glass):
 *   --glass-refraction-strength  px máximos que se desplaza el fondo en el borde
 *   --glass-blur                 desenfoque del fondo
 *   --glass-dispersion           separación de color en el canto (0 = ninguna)
 */
const canRefract = (() => {
  if (typeof navigator === 'undefined' || typeof document === 'undefined' || typeof ResizeObserver === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  return Boolean(brands?.some((item) => /Chromium/i.test(item.brand)));
})();

const IOR = 1.5;
const SAMPLES = 128;

/** Altura del canto: squircle convexo. x: 0 en el borde, 1 al final del bisel. */
const surface = (x: number) => Math.pow(1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 4), 0.25);

/** Desplazamiento normalizado (0..1) según la distancia al borde. */
const profile = (() => {
  const values = new Float32Array(SAMPLES);
  const base = 0.15; // lámina plana bajo el bisel: el borde mismo también refracta
  const d = 0.001;
  let max = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    const x = (i + 0.5) / SAMPLES;
    const slope = (surface(x + d) - surface(x - d)) / (2 * d);
    const incidence = Math.atan(slope);
    const refracted = Math.asin(Math.sin(incidence) / IOR);
    const shift = (base + surface(x)) * Math.tan(incidence - refracted);
    values[i] = shift;
    if (shift > max) max = shift;
  }
  for (let i = 0; i < SAMPLES; i += 1) values[i] /= max || 1;
  return values;
})();

// ---- PNG mínimo (sin comprimir) para no depender de canvas ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** PNG RGB de 8 bits; los datos van en bloques deflate "stored" (sin compresión). */
function encodePng(w: number, h: number, rgb: Uint8Array) {
  const stride = w * 3 + 1;
  const raw = new Uint8Array(stride * h);
  for (let y = 0; y < h; y += 1) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * stride + 1);

  const blocks = Math.ceil(raw.length / 65535) || 1;
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b += 1) {
    const start = b * 65535;
    const len = Math.min(65535, raw.length - start);
    zlib[o] = b === blocks - 1 ? 1 : 0;
    zlib[o + 1] = len & 0xff;
    zlib[o + 2] = len >>> 8;
    zlib[o + 3] = ~len & 0xff;
    zlib[o + 4] = (~len >>> 8) & 0xff;
    zlib.set(raw.subarray(start, start + len), o + 5);
    o += 5 + len;
  }
  let a = 1;
  let s = 0;
  for (let i = 0; i < raw.length; i += 1) {
    a = (a + raw[i]) % 65521;
    s = (s + a) % 65521;
  }
  new DataView(zlib.buffer).setUint32(o, ((s << 16) | a) >>> 0);

  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, w);
  hv.setUint32(4, h);
  header[8] = 8; // bits por canal
  header[9] = 2; // RGB
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib), chunk('IEND', new Uint8Array(0))];

  let binary = '';
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 0x8000) binary += String.fromCharCode(...part.subarray(i, i + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

const mapCache = new Map<string, string>();

/** Mapa de desplazamiento (R = x, G = y, 128 = sin mover) para un rectángulo redondeado w×h de radio r. */
function displacementMap(w: number, h: number, r: number, bezel: number) {
  const key = `${w}x${h}r${r}b${bezel}`;
  const cached = mapCache.get(key);
  if (cached) return cached;

  const rgb = new Uint8Array(w * h * 3);
  const hw = w / 2;
  const hh = h / 2;
  const ix = hw - r;
  const iy = hh - r;
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const x = px + 0.5 - hw;
      const y = py + 0.5 - hh;
      const qx = Math.abs(x) - ix;
      const qy = Math.abs(y) - iy;
      let dist: number;
      let nx: number;
      let ny: number;
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy) || 1;
        dist = len - r;
        nx = (qx / len) * Math.sign(x);
        ny = (qy / len) * Math.sign(y);
      } else if (qx > qy) {
        dist = qx - r;
        nx = Math.sign(x);
        ny = 0;
      } else {
        dist = qy - r;
        nx = 0;
        ny = Math.sign(y);
      }
      const inside = -dist;
      let m = 0;
      if (inside >= 0 && inside < bezel) m = profile[Math.min(SAMPLES - 1, Math.floor((inside / bezel) * SAMPLES))];
      const o = (py * w + px) * 3;
      // La luz se curva hacia dentro: en el canto se ve lo que hay un poco más hacia el centro.
      rgb[o] = Math.round(128 - nx * m * 127);
      rgb[o + 1] = Math.round(128 - ny * m * 127);
      rgb[o + 2] = 128;
    }
  }
  const url = encodePng(w, h, rgb);
  mapCache.set(key, url);
  return url;
}

const ONLY_R = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
const ONLY_G = '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0';
const ONLY_B = '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';

type Optics = { w: number; h: number; r: number; strength: number; blur: number; dispersion: number };

const num = (style: CSSStyleDeclaration, name: string, fallback: number) => {
  const value = parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
};

/** Se coloca dentro de un elemento .liquid-glass y le añade la refracción del canto. */
export function GlassLens() {
  const ref = useRef<HTMLSpanElement>(null);
  const id = `lens-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [optics, setOptics] = useState<Optics | null>(null);

  useEffect(() => {
    if (!canRefract) return;
    const host = ref.current?.parentElement;
    if (!host) return;
    const measure = () => {
      const w = Math.round(host.offsetWidth);
      const h = Math.round(host.offsetHeight);
      if (!w || !h) return;
      const style = getComputedStyle(host);
      const r = Math.min(Math.round(parseFloat(style.borderTopLeftRadius) || 0), Math.floor(Math.min(w, h) / 2));
      const next: Optics = {
        w,
        h,
        r,
        strength: num(style, '--glass-refraction-strength', 14),
        blur: num(style, '--glass-blur', 16),
        dispersion: num(style, '--glass-dispersion', 0),
      };
      setOptics((prev) =>
        prev && prev.w === next.w && prev.h === next.h && prev.r === next.r && prev.strength === next.strength && prev.blur === next.blur && prev.dispersion === next.dispersion
          ? prev
          : next,
      );
    };
    measure();
    // Sólo se vuelve a medir si cambia el tamaño (o el tema, que cambia las variables).
    const resize = new ResizeObserver(measure);
    resize.observe(host);
    const theme = new MutationObserver(measure);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    host.style.setProperty('--lens', `url(#${id})`);
    // Atributo, no clase: React reescribe className en cada render y la borraría.
    host.dataset.refract = '';
    return () => {
      resize.disconnect();
      theme.disconnect();
      host.style.removeProperty('--lens');
      delete host.dataset.refract;
    };
  }, [id]);

  if (!canRefract || !optics) return <span ref={ref} aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden" />;
  const { w, h, r, strength, blur, dispersion } = optics;
  const bezel = Math.max(6, Math.round(Math.min(w, h) * 0.42));
  const map = displacementMap(w, h, r, bezel);
  const scale = strength * 2; // el mapa va de 1 a 255 con 128 como neutro

  return (
    <span ref={ref} aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <svg width="0" height="0" focusable="false">
        <filter id={id} x="0" y="0" width={w} height={h} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation={blur} edgeMode="duplicate" result="soft" />
          <feImage href={map} x="0" y="0" width={w} height={h} preserveAspectRatio="none" result="map" />
          {dispersion > 0 ? (
            <>
              {/* Rojo, verde y azul se refractan un poco distinto: leve irisación en el canto. */}
              <feDisplacementMap in="soft" in2="map" scale={scale * (1 - dispersion)} xChannelSelector="R" yChannelSelector="G" result="dr" />
              <feColorMatrix in="dr" type="matrix" values={ONLY_R} result="red" />
              <feDisplacementMap in="soft" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" result="dg" />
              <feColorMatrix in="dg" type="matrix" values={ONLY_G} result="green" />
              <feDisplacementMap in="soft" in2="map" scale={scale * (1 + dispersion)} xChannelSelector="R" yChannelSelector="G" result="db" />
              <feColorMatrix in="db" type="matrix" values={ONLY_B} result="blue" />
              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" />
            </>
          ) : (
            <feDisplacementMap in="soft" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" />
          )}
        </filter>
      </svg>
    </span>
  );
}
