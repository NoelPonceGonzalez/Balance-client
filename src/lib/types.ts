export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  theme: 'light' | 'dark' | 'system';
  timezone: string;
}

export interface Valued {
  eur: number;
  complete: boolean;
  excluded?: string[];
}

export interface DashboardData {
  today: string;
  period: string;
  hasAccounts: boolean;
  netWorth: Valued;
  available: Valued;
  invested: Valued;
  crypto: Valued;
  personalGoods: Valued;
  unrealized: Valued;
  contributions: Valued;
  realized: Valued;
  fees: Valued;
  variation: {
    available: boolean;
    amount: number | null;
    percent: number | null;
    baseDay: string | null;
    note: string;
  };
  series: { day: string; eur: number; complete: boolean }[];
  allocation: { key: string; label: string; eur: number }[];
  pnl: { key: string; label: string; eur: number | null; accountName: string; platform: string; place?: string }[];
  extras: { id: string; place: string; name: string; valueEur: number; costEur: number | null; imageUrl?: string; boughtOn?: string; track?: boolean; counts?: boolean }[];
  accounts: {
    id: string;
    name: string;
    platform: string;
    kind: string;
    tracking: string;
    currency: string;
    balance: number;
    valueEur: number | null;
    updatedAt: string | null;
    stale: boolean;
    parts?: { label: string; eur: number; group?: string; costEur?: number | null; detail?: string; image?: string | null; id?: string | null; quantity?: number; followMarket?: boolean; moves?: { at: string; spentEur: number; quantity: number }[] }[];
    planId?: string | null;
    flows?: { day: string; label: string; amount: number; key: string; surprise: boolean; absorbed?: boolean; open?: boolean }[];
    fixed?: { label: string; amount: number; rhythm: string }[];
  }[];
  warnings: string[];
}

export interface AccountRow {
  _id: string;
  name: string;
  platform: string;
  kind: string;
  tracking: 'balance' | 'positions';
  currency: string;
  balance: number;
  eurPerUnit: number | null;
  notes: string;
  publicAddress: string;
  archived: boolean;
  balanceUpdatedAt?: string;
  updatedAt?: string;
}

export interface HoldingRow {
  _id: string;
  accountId: string;
  name: string;
  symbol: string;
  assetClass: string;
  currency: string;
  quantity: number;
  unitMarketValue: number | null;
  valuedAt: string | null;
  costBasis: number | null;
  eurPerUnit: number | null;
  notes: string;
  priceSource?: 'manual' | 'market';
  change24hPct?: number | null;
  quoteImage?: string | null;
  followMarket?: boolean;
}

export interface MarketItem {
  holdingId: string;
  accountName: string;
  name: string;
  symbol: string;
  assetClass: string;
  image: string | null;
  source: string | null;
  quoteKey?: string | null;
  sourceLabel: string;
  priceEur: number | null;
  changePct: number | null;
  changeLabel: string;
  sparkline: number[];
  quantity: number;
  valueEur: number | null;
  fetchedAt: string | null;
  stale: boolean;
  error: string | null;
  alert: { thresholdPct: number; above: number | null; below: number | null; enabled: boolean };
}

export interface MarketPending {
  holdingId: string;
  accountName: string;
  name: string;
  symbol: string;
  assetClass: string;
}

export interface MarketTapeItem {
  key: string;
  kind: 'crypto' | 'etf' | 'stock' | 'gold' | 'cs2' | 'tf2';
  name: string;
  symbol: string;
  image: string | null;
  sourceLabel: string;
  priceEur: number | null;
  changePct: number | null;
  changeLabel: string;
  sparkline: number[];
  fetchedAt: string | null;
  stale: boolean;
  error: string | null;
}

export interface MarketStory {
  series: { at: string; eur: number }[];
  changePct: number | null;
  changeLabel: string;
  floats: { label: string; range: string; priceEur: number; sales: number; yours: boolean }[];
  note: string;
}

export interface MarketBoard {
  updatedAt: string | null;
  warning: string | null;
  items: MarketItem[];
  pending: MarketPending[];
  cryptos: MarketTapeItem[];
  etfs: MarketTapeItem[];
  stocks?: MarketTapeItem[];
  gold?: MarketTapeItem[];
  cs2?: MarketTapeItem[];
  tf2?: MarketTapeItem[];
  icons?: { cs2: string | null; tf2: string | null };
}

export interface QuoteCandidate {
  source: 'coingecko' | 'yahoo';
  externalId: string;
  symbol: string;
  name: string;
  image: string | null;
  rank: number | null;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  direction: 'up' | 'down' | 'due';
  changePct: number | null;
  read: boolean;
  createdAt: string;
}

export interface MovementRow {
  _id: string;
  type: string;
  date: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  accountId: string;
  counterAccountId?: string | null;
  holdingId?: string | null;
  quantity?: number | null;
  direction?: 'in' | 'out';
  fee?: number | null;
  applyToBalances: boolean;
  source: string;
}

export interface PlanEvent {
  _id?: string;
  name: string;
  amount: number;
  date: string;
  status?: 'expected' | 'confirmed';
  paid?: boolean;
  surprise?: boolean;
  automatic?: boolean;
  image?: string;
}

export interface PlanInterval {
  _id?: string;
  name: string;
  amount: number;
  everyWeeks: number;
  startDate: string;
  paidDates?: string[];
  direction?: 'in' | 'out';
}

export interface PlanMonthLine {
  label: string;
  tone: 'plain' | 'in' | 'out' | 'final';
  amount: number | null;
  balance: number;
  markKey?: string;
  paid?: boolean;
  automatic?: boolean;
  absorbed?: boolean;
  day?: string;
}

export interface PlanMonthView {
  month: string;
  title: string;
  lines: PlanMonthLine[];
}

export interface PlanRow {
  _id: string;
  name: string;
  kind?: 'patrimonio' | 'liquidez' | 'inversion';
  field?: string;
  salary?: number;
  salaryAccountId?: string | null;
  savingsDay?: number | null;
  openingBalance: number;
  startDate: string;
  targetAmount: number;
  targetDate: string;
  monthlySavings: number;
  linkedAccountIds: string[];
  manualRealBalance: number | null;
  recurring: { _id?: string; name: string; amount: number; dayOfMonth: number; paidDates?: string[]; direction?: 'in' | 'out' }[];
  intervals?: PlanInterval[];
  surpriseCleared?: string[];
  plannedExpenses: PlanEvent[];
  incomes: PlanEvent[];
  scenarios: { name: string; monthlySavings: number }[];
}

export interface PlanForecast {
  plannedToday: number;
  plannedWithExpectedToday: number;
  balanceYesterday?: number;
  today?: string;
  realBalance: number | null;
  anchor?: { amount: number; label: string } | null;
  deviationEur: number;
  compliancePct: number | null;
  onTrack: boolean;
  estimatedDate: string | null;
  extraMonths?: number | null;
  extraMonthlyToRecover: number | null;
  gapAtTarget: number;
  series: { month: string; planned: number; withExpected: number }[];
  months?: PlanMonthView[];
  scenarios: { id: string; name: string; estimatedDate: string | null; balanceAtTarget: number }[];
  notes: string[];
}
