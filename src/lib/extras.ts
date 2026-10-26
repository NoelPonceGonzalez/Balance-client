export interface ExtraPlace {
  id: string;
  name: string;
  hint: string;
  image: string | null;
}

export const EXTRA_PLACES: ExtraPlace[] = [
  { id: 'objeto', name: 'Objeto', hint: 'Un reloj, un PC, un anillo. Algo que te quedas.', image: '/extras/objeto.svg' },
  { id: 'cs2', name: 'CS2', hint: 'Skins y objetos', image: '/platforms/cs2.svg' },
  { id: 'tf2', name: 'TF2', hint: 'Objetos, llaves y metales', image: '/extras/tf2.svg' },
  { id: 'steam', name: 'Steam', hint: 'Inventario', image: '/brands/steam.png' },
  { id: 'ledger', name: 'Ledger', hint: 'Lo que guardas en la Ledger', image: '/platforms/ledger.png' },
  { id: 'trezor', name: 'Trezor', hint: 'Lo que guardas en la Trezor', image: '/platforms/trezor.png' },
  { id: 'tangem', name: 'Tangem', hint: 'Lo que guardas en Tangem', image: '/platforms/tangem.png' },
  { id: 'safepal', name: 'SafePal', hint: 'Lo que guardas en SafePal', image: '/platforms/safepal.png' },
  { id: 'onekey', name: 'OneKey', hint: 'Lo que guardas en OneKey', image: '/platforms/onekey.png' },
  { id: 'otro', name: 'Otro sitio', hint: 'Un sitio que no está en la lista', image: null },
];

export function extraPlace(id: string | null | undefined): ExtraPlace | undefined {
  return EXTRA_PLACES.find((place) => place.id === id);
}
