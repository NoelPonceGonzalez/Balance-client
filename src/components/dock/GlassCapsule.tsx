/**
 * GLASS MATERIAL + GLASS GEOMETRY del dock.
 *
 * Es el mismo material Liquid Glass aprobado (clase .liquid-glass, variables --glass-*, mapa óptico
 * de LiquidGlass.tsx con la ley de Snell), pero preparado para cambiar de ancho en cada fotograma:
 *
 * - El mapa de una cápsula (radio = alto / 2) es separable: canto izquierdo + franja central que solo
 *   depende de la altura + canto derecho. Se calculan UNA vez por altura (dos PNG en caché) y el filtro
 *   SVG los compone: los cantos se recortan con la subregión de feOffset y la franja se repite con feTile.
 * - Cambiar el ancho solo mueve 4 atributos del filtro (sin React, sin PNG nuevos, sin medir el DOM).
 * - El ancho es real (no un scale): el cristal nunca se estira, el canto conserva su grosor y la
 *   refracción sigue siendo la del dock aprobado durante toda la transición.
 *
 * Con un mismo alto, la composición es idéntica píxel a píxel al mapa de GlassLens (ver validación).
 * Navegadores sin filtros SVG en backdrop-filter: el fallback esmerilado de .liquid-glass, igual que antes.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { motion, type MotionValue } from 'motion/react';
import { canRefract, displacementMap } from '@/components/LiquidGlass';
import { cn } from '@/lib/utils';

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
  return { r, cap: displacementMap(h, h, r, bezel), bar: displacementMap(h + 2, h, r, bezel) };
}

export function GlassCapsule({
  x,
  width,
  height,
  scaleX,
  scaleY,
  opacity,
  pressed = false,
  className,
}: {
  x: MotionValue<number>;
  width: MotionValue<number>;
  height: number;
  scaleX?: MotionValue<number>;
  scaleY?: MotionValue<number>;
  opacity?: MotionValue<number>;
  pressed?: boolean;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<SVGFilterElement>(null);
  const capRightRef = useRef<SVGFEOffsetElement>(null);
  const middleRef = useRef<SVGFETileElement>(null);
  const id = `capsule-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [optics, setOptics] = useState<Optics | null>(null);
  const h = Math.round(height);
  const half = Math.floor(h / 2);

  // Variables ópticas: se leen al montar y al cambiar el tema (no por fotograma).
  useEffect(() => {
    const host = hostRef.current;
    if (!canRefract || !host) return;
    const read = () => {
      const style = getComputedStyle(host);
      const next = { strength: num(style, '--glass-refraction-strength', 14), blur: num(style, '--glass-blur', 16), dispersion: num(style, '--glass-dispersion', 0) };
      setOptics((prev) => (prev && prev.strength === next.strength && prev.blur === next.blur && prev.dispersion === next.dispersion ? prev : next));
    };
    read();
    const theme = new MutationObserver(read);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    host.style.setProperty('--lens', `url(#${id})`);
    host.dataset.refract = '';
    return () => {
      theme.disconnect();
      host.style.removeProperty('--lens');
      delete host.dataset.refract;
    };
  }, [id]);

  // Geometría por fotograma: solo atributos del filtro, sin renders.
  useLayoutEffect(() => {
    if (!canRefract || !optics) return;
    const apply = (w: number) => {
      const wide = Math.max(h, Math.round(w));
      filterRef.current?.setAttribute('width', String(wide));
      capRightRef.current?.setAttribute('dx', String(wide - h));
      capRightRef.current?.setAttribute('x', String(wide - half));
      middleRef.current?.setAttribute('width', String(Math.max(1, wide - 2 * half)));
    };
    apply(width.get());
    return width.on('change', apply);
  }, [width, optics, h, half]);

  // Invisible = sin backdrop-filter: el cristal del buscador no cuesta nada mientras está recogido.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!opacity || !host) return;
    const apply = (value: number) => { host.style.visibility = value <= 0.001 ? 'hidden' : ''; };
    apply(opacity.get());
    return opacity.on('change', apply);
  }, [opacity]);

  const maps = canRefract && optics ? capsuleMaps(h) : null;
  const scale = (optics?.strength ?? 0) * 2;
  const w0 = Math.max(h, Math.round(width.get()));

  return (
    <motion.div
      ref={hostRef}
      aria-hidden
      className={cn('liquid-glass pointer-events-none absolute left-0 top-0 rounded-full', pressed && 'is-pressed', className)}
      style={{ x, width, height: h, scaleX, scaleY, opacity, borderRadius: 999 }}
    >
      {maps && optics ? (
        <svg width="0" height="0" focusable="false" className="pointer-events-none absolute h-0 w-0 overflow-hidden">
          <filter ref={filterRef} id={id} x="0" y="0" width={w0} height={h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation={optics.blur} edgeMode="duplicate" result="soft" />
            {/* Mapa compuesto: neutro debajo, franja central repetida y los dos cantos encima. */}
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
            {optics.dispersion > 0 ? (
              <>
                <feDisplacementMap in="soft" in2="map" scale={scale * (1 - optics.dispersion)} xChannelSelector="R" yChannelSelector="G" result="dr" />
                <feColorMatrix in="dr" type="matrix" values={ONLY_R} result="red" />
                <feDisplacementMap in="soft" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" result="dg" />
                <feColorMatrix in="dg" type="matrix" values={ONLY_G} result="green" />
                <feDisplacementMap in="soft" in2="map" scale={scale * (1 + optics.dispersion)} xChannelSelector="R" yChannelSelector="G" result="db" />
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
    </motion.div>
  );
}
