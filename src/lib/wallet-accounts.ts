import { api } from '@/lib/api';

export interface WalletAccount {
  id: string;
  name: string;
  kind: string;
  tracking: 'balance' | 'positions';
  platform: string;
  balance: number;
}

interface RawAccount {
  _id: string;
  name: string;
  currency: string;
  archived?: boolean;
  kind: string;
  tracking: 'balance' | 'positions';
  platform: string;
  balance: number;
}

let cache: WalletAccount[] | null = null;
let flight: Promise<WalletAccount[]> | null = null;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asWallets(data: { accounts?: RawAccount[] }): WalletAccount[] {
  return (data.accounts || [])
    .filter((account) => account.currency === 'EUR' && !account.archived)
    .map((account) => ({
      id: String(account._id),
      name: account.name,
      kind: account.kind,
      tracking: account.tracking,
      platform: account.platform,
      balance: account.balance,
    }));
}

export function cachedWallets(): WalletAccount[] {
  return cache ? cache.slice() : [];
}

export function forgetWallets() {
  cache = null;
  flight = null;
}

/** Una sola petición compartida. Si falla, se reintenta; la hoja de la foto no se queda con una sola cartera. */
export function loadWallets(): Promise<WalletAccount[]> {
  if (cache) return Promise.resolve(cache.slice());
  if (flight) return flight;
  flight = (async () => {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const data = await api<{ accounts?: RawAccount[] }>('/api/accounts');
        if (!Array.isArray(data.accounts)) throw new Error('vacío');
        cache = asWallets(data);
        return cache.slice();
      } catch (error) {
        last = error;
        if (attempt < 2) await wait(600 * (attempt + 1));
      }
    }
    flight = null;
    throw last;
  })();
  return flight;
}
