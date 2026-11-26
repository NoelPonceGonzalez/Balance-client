/**
 * GLASS MATERIAL + GLASS GEOMETRY del dock.
 *
 * Mismo material Liquid Glass aprobado (clase .liquid-glass, variables --glass-*, mapa óptico de
 * LiquidGlass.tsx con la ley de Snell), preparado para cambiar de forma a 60 fps. Dos capas:
 *
 *  · óptica  (.liquid-glass[data-part=optics]): backdrop-filter con la refracción + tinte. Tamaño FIJO:
 *            solo se desplaza (transform) y se recorta con clip-path a la forma actual. Su capa nunca
 *            cambia de tamaño. El mapa es fijo por altura (canto + franja + canto, en caché); por fotograma
 *            solo se mueven 3 atributos del canto derecho, sin calcular PNG ni pasar por React.
 *  · brillo  (.liquid-glass[data-part=sheen]): reflejos especulares, canto, grosor y sombras con las
 *            reglas exactas del bloque aprobado (en % del ancho real). Sin backdrop-filter: barato.
 *
 * En reposo, la suma es idéntica al cristal aprobado (ver preview/glass-test.html).
 * Navegadores sin filtros SVG en backdrop-filter: el fallback esmerilado de .liquid-glass, igual que antes.
 */
import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motion, type MotionValue } from 'motion/react';
import { canRefract, displacementMap } from '@/components/LiquidGlass';
import { cn } from '@/lib/utils';

/** Ancho fijo por defecto de la capa óptica. */
export const OPTICS_SPAN = 400;

const ONLY_R = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
const ONLY_G = '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0';
const ONLY_B = '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';

type Optics = { strength: number; blur: number; dispersion: number };

const num = (style: CSSStyleDeclaration, name: string, fallback: number) => {
  const value = parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
};

/** Mapas fijos para una altura: círculo (cantos) y cápsula de h+2 (su columna central es la franja). */
function capsuleMaps(h: number) {
  const r = Math.floor(h / 2);
  const bezel = Math.max(6, Math.round(h * 0.42)); // mismo bisel que GlassLens para una cápsula
  return { cap: displacementMap(h, h, r, bezel), bar: displacementMap(h + 2, h, r, bezel) };
}

/** Variables ópticas del tema: se leen al montar y al cambiar de tema (nunca por fotograma). */
function useOptics(probe: RefObject<HTMLElement | null>): Optics | null {
  const [optics, setOptics] = useState<Optics | null>(null);
  useEffect(() => {
    const host = probe.current;
    if (!canRefract || !host) return;
    const read = () => {
      const style = getComputedStyle(host);
      const next = { strength: num(style, '--glass-refraction-strength', 14), blur: num(style, '--glass-blur', 16), dispersion: num(style, '--glass-dispersion', 0) };
      setOptics((prev) => (prev && prev.strength === next.strength && prev.blur === next.blur && prev.dispersion === next.dispersion ? prev : next));
    };
    read();
    const theme = new MutationObserver(read);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => theme.disconnect();
  }, [probe]);
  return optics;
}

export const GlassCapsule = memo(function GlassCapsule({
  x,
  width,
  height,
  span = OPTICS_SPAN,
  scaleX,
  scaleY,
  opacity,
  pressed = false,
}: {
  x: MotionValue<number>;
  width: MotionValue<number>;
  height: number;
  /** Ancho fijo de la capa óptica: el máximo que alcanzará esta cápsula (coste del backdrop-filter). */
  span?: number;
  scaleX?: MotionValue<number>;
  scaleY?: MotionValue<number>;
  opacity?: MotionValue<number>;
  pressed?: boolean;
}) {
  const opticsRef = useRef<HTMLDivElement>(null);
  const capRightRef = useRef<SVGFEOffsetElement>(null);
  const middleRef = useRef<SVGFETileElement>(null);
  const optics = useOptics(opticsRef);
  const id = `glass-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const h = Math.round(height);
  const half = Math.floor(h / 2);
  const W = Math.max(Math.round(height), Math.round(span));
  const wide = (w: number) => Math.min(W, Math.max(h, w));

  // Por fotograma, sin React: recorte de la capa óptica, ancho del brillo, origen y canto derecho del mapa.
  // Suscripción explícita (y relectura al cambiar el ancho fijo W): nunca queda un valor viejo.
  const rootRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let last = -1;
    const apply = (w: number) => {
      const shown = wide(w);
      if (opticsRef.current) opticsRef.current.style.clipPath = `inset(0px ${(W - shown).toFixed(2)}px 0px 0px round ${half}px)`;
      if (sheenRef.current) sheenRef.current.style.width = `${shown}px`;
      if (rootRef.current) rootRef.current.style.transformOrigin = `${shown / 2}px ${h / 2}px`;
      const right = Math.round(shown);
      if (right === last || !canRefract || !optics) return;
      last = right;
      capRightRef.current?.setAttribute('dx', String(right - h));
      capRightRef.current?.setAttribute('x', String(right - half));
      middleRef.current?.setAttribute('width', String(Math.max(1, right - 2 * half)));
    };
    apply(width.get());
    return width.on('change', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, optics, h, half, W]);

  const refract = canRefract && optics ? optics : null;
  const maps = refract ? capsuleMaps(h) : null;
  const scale = (refract?.strength ?? 0) * 2;
  const w0 = Math.round(wide(width.get()));

  return (
    <motion.div ref={rootRef} aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ x, opacity, scaleX, scaleY, width: 0, height: h }}>
      {maps && refract ? (
        <svg width="0" height="0" focusable="false" className="pointer-events-none absolute h-0 w-0 overflow-hidden">
          <filter id={id} x="0" y="0" width={W} height={h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation={refract.blur} edgeMode="duplicate" result="soft" />
            <feFlood floodColor="rgb(128,128,128)" result="neutral" />
            <feImage href={maps.cap} x="0" y="0" width={h} height={h} preserveAspectRatio="none" result="cap" />
            <feOffset in="cap" dx="0" dy="0" x="0" y="0" width={half} height={h} result="capL" />
            <feOffset ref={capRightRef} in="cap" dx={w0 - h} dy="0" x={w0 - half} y="0" width={half} height={h} result="capR" />
            <feImage href={maps.bar} x="0" y="0" width={h + 2} height={h} preserveAspectRatio="none" result="bar" />
            <feOffset in="bar" dx="0" dy="0" x={half} y="0" width="1" height={h} result="column" />
            <feTile ref={middleRef} in="column" x={half} y="0" width={Math.max(1, w0 - 2 * half)} height={h} result="middle" />
            <feMerge result="map">
              <feMergeNode in="neutral" />
              <feMergeNode in="middle" />
              <feMergeNode in="capL" />
              <feMergeNode in="capR" />
            </feMerge>
            {refract.dispersion > 0 ? (
              <>
                <feDisplacementMap in="soft" in2="map" scale={scale * (1 - refract.dispersion)} xChannelSelector="R" yChannelSelector="G" result="dr" />
                <feColorMatrix in="dr" type="matrix" values={ONLY_R} result="red" />
                <feDisplacementMap in="soft" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" result="dg" />
                <feColorMatrix in="dg" type="matrix" values={ONLY_G} result="green" />
                <feDisplacementMap in="soft" in2="map" scale={scale * (1 + refract.dispersion)} xChannelSelector="R" yChannelSelector="G" result="db" />
                <feColorMatrix in="db" type="matrix" values={ONLY_B} result="blue" />
                <feBlend in="red" in2="green" mode="screen" result="rg" />
                <feBlend in="rg" in2="blue" mode="screen" />
              </>
            ) : (
              <feDisplacementMap in="soft" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" />
            )}
          </filter>
        </svg>
      ) : null}
      <motion.div
        ref={opticsRef}
        data-part="optics"
        data-refract={refract ? '' : undefined}
        className="liquid-glass absolute left-0 top-0"
        style={{ width: W, height: h, ['--lens' as string]: refract ? `url(#${id})` : undefined }}
      />
      <div
        ref={sheenRef}
        data-part="sheen"
        className={cn('liquid-glass absolute left-0 top-0 rounded-full', pressed && 'is-pressed')}
        style={{ height: h, borderRadius: 999 }}
      />
    </motion.div>
  );
});
