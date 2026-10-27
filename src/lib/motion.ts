/** Curva continua, sin el golpe del muelle corto. */
export const glide = { duration: 0.48, ease: [0.22, 1, 0.36, 1] as const };

export const softSpring = { type: 'spring' as const, stiffness: 240, damping: 34, mass: 0.95 };
