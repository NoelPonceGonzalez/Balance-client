import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

export type MarketCode = 'EUR' | 'USD';

const KEY = 'pat_market_ccy';

type Rate = { code: MarketCode; usdPerEur: number };

const fallback: Rate = { code: 'EUR', usdPerEur: 0 };
let current: Rate = fallback;

function readCode(): MarketCode {
  try {
    return localStorage.getItem(KEY) === 'USD' ? 'USD' : 'EUR';
  } catch {
    return 'EUR';
  }
}

function dollars(): boolean {
  return current.code === 'USD' && current.usdPerEur > 0;
}

export function marketCode(): MarketCode {
  return current.code;
}

export function marketMark(): '€' | '$' {
  return dollars() ? '$' : '€';
}

export function marketReady(): boolean {
  return current.code === 'EUR' || current.usdPerEur > 0;
}

export function marketMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const shown = dollars() ? value * current.usdPerEur : value;
  const abs = Math.abs(shown);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: dollars() ? 'USD' : 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(shown);
}

export function marketDisplay(eur: number): string {
  const shown = dollars() ? eur * current.usdPerEur : eur;
  return String(Math.round(shown * 100) / 100);
}

export function marketToEur(amount: number): number {
  if (!dollars()) return amount;
  return amount / current.usdPerEur;
}

function scaleAmount(value: string, factor: number): string {
  const number = Number(value.trim().replace(',', '.'));
  if (!(number > 0) || !Number.isFinite(factor) || factor === 1) return value;
  return String(Math.round(number * factor * 100) / 100);
}

/** Al cambiar €/$, los importes que ya están escritos en un formulario siguen el cambio. */
export function useRescaleAmounts(...setters: Array<(update: (value: string) => string) => void>): void {
  const mark = marketMark();
  const previous = useRef(mark);
  const sets = useRef(setters);
  sets.current = setters;
  useEffect(() => {
    if (previous.current === mark) return;
    const rate = current.usdPerEur;
    const factor = previous.current === '€' && mark === '$' ? rate : previous.current === '$' && mark === '€' && rate > 0 ? 1 / rate : 1;
    previous.current = mark;
    if (!(factor > 0) || factor === 1) return;
    for (const set of sets.current) set((value) => scaleAmount(value, factor));
  }, [mark]);
}

const CurrencyContext = createContext<{ code: MarketCode; setCode: (code: MarketCode) => void } | null>(null);

export function useMarketCode(): { code: MarketCode; setCode: (code: MarketCode) => void } {
  const value = useContext(CurrencyContext);
  if (!value) return { code: current.code, setCode: () => undefined };
  return value;
}

async function loadDollar(): Promise<number | null> {
  try {
    const board = await api<{ coins?: { code: string; perEur: number }[] }>('/api/fx');
    const usd = board.coins?.find((coin) => coin.code === 'USD');
    if (usd && usd.perEur > 0) return usd.perEur;
  } catch {
    /* El servidor en producción puede no tener todavía esta ruta. */
  }
  try {
    const response = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
    if (!response.ok) return null;
    const data = (await response.json()) as { rates?: { USD?: number } };
    return data.rates?.USD && data.rates.USD > 0 ? data.rates.USD : null;
  } catch {
    return null;
  }
}

export function MarketCurrency({ children }: { children: ReactNode }) {
  const [code, setCodeState] = useState<MarketCode>(readCode);
  const [usdPerEur, setUsdPerEur] = useState(0);
  current = { code, usdPerEur };

  useEffect(() => {
    let cancel = false;
    void loadDollar().then((rate) => {
      if (!cancel && rate) setUsdPerEur(rate);
    });
    return () => { cancel = true; };
  }, []);

  const setCode = (next: MarketCode) => {
    try { localStorage.setItem(KEY, next); } catch { /* el navegador puede bloquear el almacenamiento */ }
    setCodeState(next);
  };

  return <CurrencyContext.Provider value={{ code, setCode }}>{children}</CurrencyContext.Provider>;
}
