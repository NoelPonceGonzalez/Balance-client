import { Banknote, Cake, Dumbbell, Gift, PiggyBank, Utensils, Wallet, Watch, type LucideIcon } from 'lucide-react';
import { findBrand } from '@/lib/brands';

const MARKS: { test: RegExp; icon: LucideIcon }[] = [
  { test: /nomin|salario|sueldo|\bpaga\b/, icon: Banknote },
  { test: /ahorro|apart/, icon: PiggyBank },
  { test: /navidad|regalo/, icon: Gift },
  { test: /cena|restaur|comida/, icon: Utensils },
  { test: /entrenador|gimnas|\bgym\b/, icon: Dumbbell },
  { test: /cumple/, icon: Cake },
  { test: /reloj|presage/, icon: Watch },
  { test: /saldo/, icon: Wallet },
];

function foldLabel(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Imagen de la marca si la hay; si no, el icono del gasto. */
export function SpendIcon({ label }: { label: string }) {
  const folded = foldLabel(label);
  const brand = folded.startsWith('saldo') ? undefined : findBrand(label);
  if (brand) {
    return <img src={`/brands/${brand.id}.${brand.image}`} alt="" className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain p-1" />;
  }
  const Icon = MARKS.find((item) => item.test.test(folded))?.icon ?? Wallet;
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
      <Icon size={18} strokeWidth={1.75} />
    </span>
  );
}
