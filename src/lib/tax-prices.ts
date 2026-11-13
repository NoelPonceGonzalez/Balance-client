const BASE = 'https://data-api.binance.vision/api/v3';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CROSS = ['ETH', 'BTC', 'BNB', 'SOL'];

interface Route {
  /** Pares de Binance que se multiplican para llegar al precio. */
  mul: string[];
  /** El último par cotiza en USDT y se pasa a euros con EURUSDT. */
  usd: boolean;
}

type Kline = [number, string, string, string, string, ...unknown[]];
type FetchJson = (url: string) => Promise<unknown>;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Binance ha respondido ${response.status}`);
  return response.json();
}

function dayStart(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function hourOf(time: string): number {
  return Number(time.slice(0, 2)) || 0;
}

/** Precios históricos en euros a partir de las velas públicas de Binance. */
export function createPricer(load: FetchJson = fetchJson) {
  let symbols: Set<string> | null = null;
  const routes = new Map<string, Route | null>();
  const daily = new Map<string, Map<string, number>>();
  const hourly = new Map<string, Map<number, number>>();
  const wanted = new Set<string>();

  function route(asset: string): Route | null {
    const coin = asset.toUpperCase();
    if (routes.has(coin)) return routes.get(coin) ?? null;
    let found: Route | null = null;
    if (coin === 'EUR') found = { mul: [], usd: false };
    else if (coin === 'USDT') found = { mul: [], usd: true };
    else if (symbols?.has(`${coin}EUR`)) found = { mul: [`${coin}EUR`], usd: false };
    else if (symbols?.has(`${coin}USDT`)) found = { mul: [`${coin}USDT`], usd: true };
    else {
      for (const base of CROSS) {
        if (base === coin || !symbols?.has(`${coin}${base}`)) continue;
        const next = route(base);
        if (next) {
          found = { mul: [`${coin}${base}`, ...next.mul], usd: next.usd };
          break;
        }
      }
    }
    routes.set(coin, found);
    return found;
  }

  function pairsFor(asset: string): string[] | null {
    const path = route(asset);
    if (!path) return null;
    return path.usd ? [...path.mul, 'EURUSDT'] : path.mul;
  }

  return {
    async prepare() {
      if (symbols) return;
      const list = (await load(`${BASE}/ticker/price`)) as { symbol: string }[];
      symbols = new Set(list.map((item) => item.symbol));
    },

    /** Apunta un precio que hará falta. Con hora se usa la vela de esa hora; sin hora, el cierre del día. */
    need(asset: string, date: string, time: string | null) {
      for (const pair of pairsFor(asset) || []) wanted.add(time ? `h|${pair}|${date}` : `d|${pair}|${date.slice(0, 4)}`);
    },

    async load(onProgress?: (done: number, total: number) => void) {
      const keys = [...wanted].filter((key) => !(key.startsWith('h|') ? hourly.has(key.slice(2)) : daily.has(key.slice(2))));
      let done = 0;
      const next = async (): Promise<void> => {
        const key = keys.shift();
        if (!key) return;
        const [grain, pair, when] = key.split('|');
        try {
          if (grain === 'd') {
            const year = Number(when);
            const rows = (await load(`${BASE}/klines?symbol=${pair}&interval=1d&startTime=${Date.UTC(year, 0, 1)}&endTime=${Date.UTC(year + 1, 0, 1) - 1}&limit=1000`)) as Kline[];
            daily.set(`${pair}|${when}`, new Map(rows.map((row) => [new Date(row[0]).toISOString().slice(0, 10), Number(row[4])])));
          } else {
            const start = dayStart(when);
            const rows = (await load(`${BASE}/klines?symbol=${pair}&interval=1h&startTime=${start}&endTime=${start + DAY - 1}&limit=24`)) as Kline[];
            hourly.set(`${pair}|${when}`, new Map(rows.map((row) => [Math.floor((row[0] - start) / HOUR), Number(row[4])])));
          }
        } catch {
          if (grain === 'd') daily.set(`${pair}|${when}`, new Map());
          else hourly.set(`${pair}|${when}`, new Map());
        }
        done += 1;
        onProgress?.(done, done + keys.length);
        return next();
      };
      await Promise.all(Array.from({ length: Math.min(6, keys.length) }, next));
    },

    /** Precio en euros de una unidad. null si Binance no lo tiene. */
    get(asset: string, date: string, time: string | null): number | null {
      const pairs = pairsFor(asset);
      if (!pairs) return null;
      if (!pairs.length) return 1;
      let price = 1;
      for (const pair of pairs) {
        let close: number | undefined;
        if (time) {
          const hours = hourly.get(`${pair}|${date}`);
          const wantedHour = hourOf(time);
          close = hours?.get(wantedHour);
          if (close == null && hours?.size) {
            const nearest = [...hours.keys()].sort((a, b) => Math.abs(a - wantedHour) - Math.abs(b - wantedHour))[0];
            close = hours.get(nearest);
          }
        } else {
          close = daily.get(`${pair}|${date.slice(0, 4)}`)?.get(date);
        }
        if (!(close != null && close > 0)) return null;
        price = pair === 'EURUSDT' ? price / close : price * close;
      }
      return price;
    },
  };
}

export type Pricer = ReturnType<typeof createPricer>;
