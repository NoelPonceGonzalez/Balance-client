import { baseAsset } from './tax-report';
import type { MovementRow } from './types';

export interface MoveFace {
  title: string;
  kind: string;
}

const CLOCK = /(\d{2}:\d{2}:\d{2})/;
const GAP = 2;

function clockOf(row: MovementRow): string {
  return (row.description.match(CLOCK) || [])[1] || '';
}

function seconds(clock: string): number {
  const [h, m, s] = clock.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

function coin(row: MovementRow): string {
  return (row.currency || '').trim().toUpperCase();
}

/**
 * El extracto de Binance apunta el staking como una venta y una compra
 * (ETH que sale, WBETH que entra). En la lista es el mismo activo en otro formato.
 */
export function moveFaces(rows: MovementRow[]): Map<string, MoveFace> {
  const faces = new Map<string, MoveFace>();
  const buckets = new Map<string, MovementRow[]>();
  for (const row of rows) {
    if (row.type !== 'buy' && row.type !== 'sell') continue;
    if (!clockOf(row) || coin(row) === 'EUR') continue;
    const key = `${row.accountId}|${row.date}`;
    const list = buckets.get(key) || [];
    list.push(row);
    buckets.set(key, list);
  }

  for (const list of buckets.values()) {
    const pending = [...list].sort((a, b) => clockOf(a).localeCompare(clockOf(b)));
    while (pending.length) {
      const seed = pending.shift();
      if (!seed) break;
      const cluster = [seed];
      for (let index = 0; index < pending.length;) {
        const other = pending[index];
        const near = cluster.some((item) => Math.abs(seconds(clockOf(item)) - seconds(clockOf(other))) <= GAP);
        if (near) {
          cluster.push(other);
          pending.splice(index, 1);
        } else index += 1;
      }
      const outs = cluster.filter((row) => row.type === 'sell');
      const ins = cluster.filter((row) => row.type === 'buy');
      if (!outs.length || !ins.length) continue;
      const codes = cluster.map(coin);
      const family = baseAsset(codes[0]);
      if (!codes.every((code) => baseAsset(code) === family) || new Set(codes).size < 2) continue;
      const from = [...new Set(outs.map(coin))].join(' + ');
      const to = [...new Set(ins.map(coin))].join(' + ');
      const back = outs.some((row) => coin(row) !== family);
      const title = back ? `${from} vuelve a ${to}` : `${from} pasa a ${to}`;
      for (const row of cluster) faces.set(String(row._id), { title, kind: 'Mismo activo' });
    }
  }
  return faces;
}
