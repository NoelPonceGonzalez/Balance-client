import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTaxReport, type TaxInput } from './tax-report.ts';
import type { Pricer } from './tax-prices.ts';

const pricer = {
  get down() {
    return false;
  },
  async prepare() {},
  need() {},
  async load() {},
  get() {
    return 100;
  },
} as Pricer;

function book(): TaxInput {
  return {
    accounts: [
      { _id: 'okx', name: 'OKX', platform: 'OKX', kind: 'exchange', tracking: 'positions', currency: 'EUR', balance: 0, eurPerUnit: null, notes: '', publicAddress: '', archived: false },
      { _id: 'tr', name: 'Trade Republic', platform: 'Trade Republic', kind: 'broker', tracking: 'positions', currency: 'EUR', balance: 80, eurPerUnit: null, notes: '', publicAddress: '', archived: false },
    ],
    holdings: [
      {
        _id: 'okx-btc',
        accountId: 'okx',
        name: 'Bitcoin',
        symbol: 'BTC',
        assetClass: 'crypto',
        currency: 'EUR',
        quantity: 0,
        unitMarketValue: 100,
        valuedAt: null,
        costBasis: 0,
        eurPerUnit: null,
        notes: '',
        buys: [{ at: '2025-11-13T10:00:00.000Z', spentEur: 1800, quantity: 0.03 }],
      },
      {
        _id: 'tr-btc',
        accountId: 'tr',
        name: 'Bitcoin',
        symbol: 'BTC',
        assetClass: 'crypto',
        currency: 'EUR',
        quantity: 0.03,
        unitMarketValue: 100,
        valuedAt: null,
        costBasis: 1800,
        eurPerUnit: null,
        notes: '',
      },
    ],
    movements: [
      {
        _id: 'pass',
        type: 'transfer',
        date: '2025-11-18',
        amount: 1700,
        currency: 'EUR',
        category: '',
        description: 'Bitcoin',
        accountId: 'okx',
        counterAccountId: 'tr',
        holdingId: 'okx-btc',
        quantity: 0.03,
        applyToBalances: true,
        source: 'manual',
      },
    ],
  };
}

describe('informe de la renta', () => {
  it('un traspaso no tributa y a 31 de diciembre la moneda está en la cuenta de destino', async () => {
    const report = await buildTaxReport(book(), 2025, undefined, pricer);
    assert.equal(report.disposals.length, 0);
    assert.equal(report.lines.some((line) => line.operation === 'Traspaso' && line.concept === 'De OKX a Trade Republic' && line.effect.startsWith('Traspaso')), true);
    assert.deepEqual(
      report.yearEnd.coins.map((coin) => [coin.platform, coin.asset, coin.quantity, coin.spanish]),
      [['Trade Republic', 'BTC', 0.03, true]],
    );
    assert.equal(report.yearEnd.abroad, 0);
  });

  it('la venta posterior conserva el coste de la compra original', async () => {
    const input = book();
    input.movements.push({
      _id: 'sale',
      type: 'sell',
      date: '2025-11-20',
      amount: 2000,
      currency: 'EUR',
      category: '',
      description: 'Venta de Bitcoin',
      accountId: 'tr',
      holdingId: 'tr-btc',
      quantity: 0.03,
      applyToBalances: true,
      source: 'manual',
    });
    const report = await buildTaxReport(input, 2025, undefined, pricer);
    assert.equal(report.disposals.length, 1);
    assert.equal(report.disposals[0].cost, 1800);
    assert.equal(report.disposals[0].proceeds, 2000);
    assert.equal(report.disposals[0].gain, 200);
    assert.equal(report.disposals[0].platform, 'Trade Republic');
    assert.equal(report.yearEnd.coins.length, 0);
  });
});
