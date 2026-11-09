export type VerbId = 'in' | 'out' | 'pass' | 'balance' | 'deposit' | 'withdraw' | 'buy' | 'sell' | 'dividend' | 'swap' | 'add' | 'remove';

export interface Verb {
  id: VerbId;
  label: string;
}

const CASH: Verb[] = [
  { id: 'in', label: 'Entró' },
  { id: 'out', label: 'Salió' },
  { id: 'pass', label: 'Pasar' },
  { id: 'balance', label: 'Este es el saldo' },
];

const BROKER: Verb[] = [
  { id: 'deposit', label: 'Meter' },
  { id: 'withdraw', label: 'Sacar' },
  { id: 'buy', label: 'Comprar' },
  { id: 'sell', label: 'Vender' },
  { id: 'dividend', label: 'Dividendo' },
];

const EXCHANGE: Verb[] = [
  { id: 'deposit', label: 'Meter' },
  { id: 'withdraw', label: 'Sacar' },
  { id: 'buy', label: 'Comprar' },
  { id: 'sell', label: 'Vender' },
  { id: 'swap', label: 'Cambiar' },
];

const GOODS: Verb[] = [
  { id: 'add', label: 'Añadir' },
  { id: 'buy', label: 'Comprar' },
  { id: 'sell', label: 'Vender' },
  { id: 'remove', label: 'Quitar' },
];

export function verbsFor(kind: string, tracking: string): Verb[] {
  if (kind === 'broker') return BROKER;
  if (kind === 'exchange') return EXCHANGE;
  if (kind === 'wallet') return EXCHANGE.filter((verb) => verb.id !== 'swap');
  if (tracking === 'positions') return GOODS;
  return CASH;
}

export function verbNeedsPiece(id: VerbId): boolean {
  return id === 'buy' || id === 'sell' || id === 'swap' || id === 'add' || id === 'remove';
}

export function verbFromType(type: string, direction?: string | null, holdingId?: string | null): VerbId {
  if (type === 'income') return 'in';
  if (type === 'expense') return 'out';
  if (type === 'transfer') return 'pass';
  if (type === 'deposit') return 'deposit';
  if (type === 'withdrawal') return 'withdraw';
  if (type === 'buy') return 'buy';
  if (type === 'sell') return 'sell';
  if (type === 'reward') return 'dividend';
  if (type === 'adjustment' && holdingId) return direction === 'out' ? 'remove' : 'add';
  if (type === 'adjustment') return 'balance';
  return 'out';
}
