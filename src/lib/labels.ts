export const KIND_LABEL: Record<string, string> = {
  bank: 'Banco',
  cash: 'Efectivo',
  broker: 'Bróker',
  exchange: 'Exchange',
  wallet: 'Wallet',
  other: 'Otro',
};

export const CLASS_LABEL: Record<string, string> = {
  crypto: 'Criptomoneda',
  stock: 'Acción',
  etf: 'ETF',
  personal_good: 'Bien personal',
  other: 'Otro',
};

export const TYPE_LABEL: Record<string, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  deposit: 'Depósito',
  withdrawal: 'Retirada',
  transfer: 'Transferencia',
  buy: 'Compra',
  sell: 'Venta',
  fee: 'Comisión',
  reward: 'Recompensa',
  adjustment: 'Ajuste',
};

export const CATEGORIES = ['Nómina', 'Alimentación', 'Vivienda', 'Transporte', 'Ocio', 'Salud', 'Comisiones', 'Inversión', 'Transferencia', 'Otros'];

export const PERIODS = [
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: '90d', label: '90 días' },
  { id: '365d', label: '1 año' },
  { id: 'all', label: 'Todo' },
];
