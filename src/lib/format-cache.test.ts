import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDay, formatEur, formatNumber, formatPct, formatPrice, formatSignedEur } from './format.ts';

// Fluidez: los formateadores se crean una vez y se reutilizan. El texto debe ser idéntico al de crear uno nuevo en
// cada llamada (lo que hacía el código antes).
const VALUES = [0, 1, -1, 0.5, 12.345, -1234.5, 41175.62, 1e6 + 0.004, 0.0123, 0.000456, -0.07];

test('formatEur y formatSignedEur dan el mismo texto que un formateador nuevo', () => {
  for (const value of VALUES) {
    const fresh = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
    assert.equal(formatEur(value), fresh);
    assert.equal(formatEur(value), formatEur(value));
  }
  assert.equal(formatSignedEur(-5), `−${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(5)}`);
  assert.equal(formatEur(null), '—');
  assert.equal(formatEur(Number.NaN), '—');
});

test('formatPct, formatNumber y formatPrice conservan sus decimales', () => {
  for (const value of VALUES) {
    const pct = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(value));
    assert.ok(formatPct(value).includes(pct));
    for (const digits of [0, 2, 4]) {
      assert.equal(formatNumber(value, digits), new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(value));
    }
    const abs = Math.abs(value);
    const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
    assert.equal(formatPrice(value), new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value));
  }
});

test('formatDay da el mismo día que un formateador nuevo', () => {
  for (const iso of ['2026-01-01', '2026-11-27T10:00:00Z', '2024-02-29']) {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    const fresh = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
    assert.equal(formatDay(iso), fresh);
  }
  assert.equal(formatDay(null), '—');
});
