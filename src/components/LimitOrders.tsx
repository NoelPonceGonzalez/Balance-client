import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatEur } from '@/lib/format';
import type { HoldingRow } from '@/lib/types';
import { docId } from '@/lib/utils';
import { fieldClass } from '@/components/ui/Input';

type Asset = 'bitcoin' | 'ethereum';
type Currency = 'USD' | 'EUR';

interface LimitOrderRow {
  _id: string;
  asset: Asset;
  spendEur: number;
  limitPrice: number;
  limitCurrency: Currency;
  holdingId: string;
  status: 'open' | 'filling' | 'filled' | 'cancelled';
  quantity: number | null;
}

const PRESETS: { asset: Asset; spendEur: string; limitPrice: string; limitCurrency: Currency; label: string }[] = [
  { asset: 'bitcoin', spendEur: '1000', limitPrice: '53299.9', limitCurrency: 'EUR', label: 'BTC · 1.000 € a 53.299,9 €' },
  { asset: 'ethereum', spendEur: '500', limitPrice: '1492', limitCurrency: 'EUR', label: 'ETH · 500 € a 1.492 €' },
];

function assetOf(holding: HoldingRow): Asset | null {
  const symbol = holding.symbol.toUpperCase();
  const name = holding.name.toLowerCase();
  if (symbol === 'BTC' || symbol === 'WBTC' || name.includes('bitcoin')) return 'bitcoin';
  if (symbol === 'ETH' || symbol === 'WETH' || symbol === 'BETH' || name.includes('ethereum') || name.includes('ether')) return 'ethereum';
  return null;
}

function priceText(order: { limitPrice: number; limitCurrency: Currency }): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(order.limitPrice) + (order.limitCurrency === 'USD' ? ' $' : ' €');
}

export function LimitOrders({ holdings, onBooked }: { holdings: HoldingRow[]; onBooked: () => void }) {
  const [orders, setOrders] = useState<LimitOrderRow[]>([]);
  const [asset, setAsset] = useState<Asset>('bitcoin');
  const [spendEur, setSpendEur] = useState('1000');
  const [limitPrice, setLimitPrice] = useState('53299.9');
  const [limitCurrency, setLimitCurrency] = useState<Currency>('EUR');
  const [holdingId, setHoldingId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const seenFills = useRef<Set<string> | null>(null);

  const coins = holdings.filter((holding) => holding.assetClass === 'crypto' && holding.currency === 'EUR' && assetOf(holding) != null);

  const load = async () => {
    const data = await api<{ orders: LimitOrderRow[] }>('/api/limits');
    setOrders(data.orders);
    const filled = data.orders.filter((order) => order.status === 'filled').map((order) => order._id);
    if (seenFills.current == null) seenFills.current = new Set(filled);
    else if (filled.some((id) => !seenFills.current?.has(id))) {
      filled.forEach((id) => seenFills.current?.add(id));
      onBooked();
    }
  };

  useEffect(() => {
    let stop = false;
    const pull = () => {
      load().catch((err: Error) => { if (!stop) setError(err.message); });
    };
    pull();
    const timer = window.setInterval(pull, 60_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const match = coins.filter((holding) => assetOf(holding) === asset);
    if (!match.some((holding) => docId(holding) === holdingId)) setHoldingId(match[0] ? docId(match[0]) : '');
  }, [asset, holdings]);

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      await api('/api/limits', {
        method: 'POST',
        body: JSON.stringify({ asset, spendEur: Number(spendEur), limitPrice: Number(limitPrice), limitCurrency, holdingId }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido guardar la orden.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setError('');
    try {
      await api(`/api/limits/${id}/cancel`, { method: 'POST' });
      setOrders((rows) => rows.map((order) => (order._id === id ? { ...order, status: 'cancelled' } : order)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido cancelar.');
    }
  };

  const visible = orders.filter((order) => order.status !== 'cancelled');
  const choices = coins.filter((holding) => assetOf(holding) === asset);

  return (
    <section className="rounded-[28px] bg-white p-4 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10">
      <h3 className="text-[15px] font-semibold">Órdenes límite</h3>
      <p className="mt-1 text-[13px] font-medium text-slate-500">
        Se guardan sin tocar el saldo. Si el precio llega al límite, la compra entra sola. Si la cancelas antes, no se anota.
      </p>
      {error && <p className="mt-3 text-[13px] font-medium text-rose-600">{error}</p>}
      {visible.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/10">
          {visible.map((order) => (
            <li key={order._id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{order.asset === 'bitcoin' ? 'Bitcoin' : 'Ethereum'} · {formatEur(order.spendEur)}</span>
                <span className="block text-[12px] font-medium text-slate-400">
                  {order.status === 'filled' ? `Ejecutada a ${priceText(order)}` : order.status === 'filling' ? 'Entrando en el saldo…' : `En espera · ${priceText(order)}`}
                </span>
              </span>
              {order.status === 'open' && (
                <button type="button" onClick={() => cancel(order._id)} className="text-[13px] font-semibold text-slate-500">Cancelar</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              setAsset(preset.asset);
              setSpendEur(preset.spendEur);
              setLimitPrice(preset.limitPrice);
              setLimitCurrency(preset.limitCurrency);
            }}
            className="rounded-full border border-slate-200 px-3 py-1 text-[12px] font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300"
          >
            {preset.label}
          </button>
        ))}
      </div>
      {choices.length === 0 ? (
        <p className="mt-3 text-[13px] font-medium text-slate-500">Para guardarla, {asset === 'bitcoin' ? 'Bitcoin' : 'Ethereum'} tiene que estar en una cuenta en euros.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <select className={fieldClass} aria-label="Posición" value={holdingId} onChange={(event) => setHoldingId(event.target.value)}>
            {choices.map((holding) => <option key={docId(holding)} value={docId(holding)}>{holding.name} · {holding.symbol || holding.currency}</option>)}
          </select>
          <button type="button" disabled={busy || !holdingId} onClick={save} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950">
            Guardar en espera
          </button>
        </div>
      )}
    </section>
  );
}
