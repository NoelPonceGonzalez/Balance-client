/** Muelle con un pequeño rebote: se pasa un poco del sitio y vuelve. */
export const glide = { type: 'spring' as const, stiffness: 340, damping: 21, mass: 0.85 };

/** Muelle más blando, para cosas grandes como paneles y pastillas. */
export const softSpring = { type: 'spring' as const, stiffness: 420, damping: 25, mass: 0.8 };

/** Gelatina: rebota más, para cosas pequeñas que aparecen. */
export const jelly = { type: 'spring' as const, stiffness: 560, damping: 15, mass: 0.7 };

const SPRING_CURVE = 'linear(0, 0.06 2%, 0.24 5%, 0.53 10%, 0.82 16%, 1.02 22%, 1.11 27%, 1.12 31%, 1.08 37%, 1.02 44%, 0.98 52%, 0.97 58%, 0.99 67%, 1.005 78%, 1)';

/** Curva de muelle para animaciones hechas a mano (CSS o WAAPI). Sin soporte de linear(), un rebote simple. */
export const SPRING_EASE = typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', SPRING_CURVE) ? SPRING_CURVE : 'cubic-bezier(0.34, 1.4, 0.64, 1)';

/** Salida corta: lo que se va no rebota, para que lo nuevo entre enseguida. */
export const quickOut = { duration: 0.14, ease: [0.4, 0, 1, 1] as const };

/* ── Bloque E (D042): tokens de hojas y transiciones hechas a mano. Antes estaban repetidos en cada archivo. ── */

/** Hoja con formulario: muelle blando y sin rebote visible (el texto no debe bailar). */
export const sheetSpring = { ...softSpring, damping: 30, opacity: { duration: 0.18 } };

/** Confirmación pequeña: entra rápida y firme. */
export const confirmSpring = { type: 'spring' as const, stiffness: 620, damping: 38, mass: 0.7, opacity: { duration: 0.12 } };

/** Salida de una hoja: corta, acelerando; lo que se va no rebota. */
export const sheetOut = { duration: 0.2, ease: [0.4, 0, 1, 1] as const };

/** Curva de salida suave para WAAPI (cámara, vuelo de la foto, altura de las hojas). */
export const EASE_SETTLE = 'cubic-bezier(0.22, 0.9, 0.24, 1)';
