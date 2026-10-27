import { findBrand, isSkinName } from '@/lib/brands';
import { PLATFORMS } from '@/lib/platforms';

export type OriginKind = 'nomina' | 'ahorro' | 'regalo' | 'cena' | 'entrenador' | 'cumple' | 'reloj';

export interface OriginMark {
  label: string;
  image?: string;
  kind?: OriginKind;
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function mentions(text: string, word: string): boolean {
  const folded = fold(word);
  if (folded.length < 3) return false;
  const escaped = folded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}

const MARKS: { test: RegExp; kind: OriginKind; label: string }[] = [
  { test: /nomin|salario|sueldo|\bpaga\b/, kind: 'nomina', label: 'Nómina' },
  { test: /ahorro|apart/, kind: 'ahorro', label: 'Ahorro' },
  { test: /navidad|regalo/, kind: 'regalo', label: 'Regalo' },
  { test: /cena|restaur|comida/, kind: 'cena', label: 'Cena' },
  { test: /entrenador|gimnas|\bgym\b/, kind: 'entrenador', label: 'Entrenador' },
  { test: /cumple/, kind: 'cumple', label: 'Cumpleaños' },
  { test: /reloj|presage|seiko/, kind: 'reloj', label: 'Reloj' },
];

/** De dónde sale un apunte, para ponerle icono sin pedirlo a mano. */
export function originOf(name: string | null | undefined): OriginMark | null {
  const text = name || '';
  const folded = fold(text);
  if (!folded.trim() || folded.startsWith('saldo')) return null;
  if (/tf2|team fortress/.test(folded) && !isSkinName(text)) {
    return { label: 'TF2', image: '/extras/tf2.svg' };
  }
  if (isSkinName(text) || /\bcs2\b|counter-strike/.test(folded)) {
    return { label: 'CS2', image: '/platforms/cs2.svg' };
  }
  const platform = [...PLATFORMS]
    .filter((item) => item.id !== 'otra' && item.id !== 'cs2')
    .sort((a, b) => b.name.length - a.name.length)
    .find((item) => mentions(folded, item.name) || mentions(folded, item.id));
  if (platform) return { label: platform.name, image: `/platforms/${platform.id}.${platform.image}` };
  const brand = findBrand(text);
  if (brand) return { label: brand.name, image: `/brands/${brand.id}.${brand.image}` };
  const mark = MARKS.find((item) => item.test.test(folded));
  if (mark) return { label: mark.label, kind: mark.kind };
  return null;
}

export function skinQuery(name: string): string {
  const text = name.trim();
  if (/guante|glove/i.test(text) && /pandora/i.test(text)) return 'Sport Gloves Pandora';
  return text;
}
