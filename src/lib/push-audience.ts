/**
 * Huella corta del usuario (la misma que `server/src/domain/push-audience.ts`): el service worker solo
 * enseña el detalle de un aviso si va para la sesión abierta en este móvil.
 */
export async function pushAudience(userId: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(userId)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
