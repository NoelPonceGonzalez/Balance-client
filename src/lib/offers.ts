export interface Offer {
  id: 'gratis' | 'personal' | 'casa';
  name: string;
  price: string;
  period: string;
  month: string;
  cap: number | null;
  span: string;
  line: string;
}

/** El plan lo marca el número de movimientos. Quien la ha creado tiene Casa. */
export const OFFERS: Offer[] = [
  {
    id: 'gratis',
    name: 'Gratis',
    price: '0 €',
    period: 'para siempre',
    month: '',
    cap: 400,
    span: '400 movimientos',
    line: 'El mes, la cámara y las carteras.',
  },
  {
    id: 'personal',
    name: 'Personal',
    price: '36 €',
    period: 'al año',
    month: '3 € al mes',
    cap: 3000,
    span: '3.000 movimientos',
    line: 'La renta de cada año, el aviso al entrar en zona y la foto junto al movimiento.',
  },
  {
    id: 'casa',
    name: 'Casa',
    price: '72 €',
    period: 'al año',
    month: '6 € al mes',
    cap: null,
    span: 'Sin límite',
    line: 'Otra persona en casa, su renta, los planes compartidos y una copia de todo.',
  },
];

export function isCreator(username?: string): boolean {
  return (username || '').trim().toLowerCase() === 'noel';
}

export function offerFor(count: number, creator = false): Offer {
  if (creator) return OFFERS.find((offer) => offer.id === 'casa') || OFFERS[OFFERS.length - 1];
  return OFFERS.find((offer) => offer.cap == null || count <= offer.cap) || OFFERS[OFFERS.length - 1];
}

export function formatCount(count: number): string {
  return new Intl.NumberFormat('es-ES').format(count);
}
