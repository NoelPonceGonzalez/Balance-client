import test from 'node:test';
import assert from 'node:assert/strict';
import { coverRadius, flightGeometry } from './camera-reveal.ts';

test('el círculo de apertura tapa la pantalla entera desde el botón del dock', () => {
  const w = 430;
  const h = 932;
  const r = coverRadius(215, 880, w, h);
  for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    assert.ok(Math.hypot(x - 215, y - 880) <= r, `esquina ${x},${y} fuera del círculo`);
  }
});

test('la foto vuela a su miniatura sin deformarse y acaba recortada justo en ella', () => {
  const rect = { left: 179, top: 520, width: 72, height: 96 };
  const vw = 430;
  const vh = 932;
  const g = flightGeometry(rect, vw, vh);
  // Escala uniforme: la imagen cubre la miniatura en los dos ejes.
  assert.ok(vw * g.scale >= rect.width - 1e-9);
  assert.ok(vh * g.scale >= rect.height - 1e-9);
  // La caja visible tras escalar y recortar es exactamente la miniatura.
  const left = g.tx + g.ix * g.scale;
  const top = g.ty + g.iy * g.scale;
  const width = (vw - 2 * g.ix) * g.scale;
  const height = (vh - 2 * g.iy) * g.scale;
  assert.ok(Math.abs(left - rect.left) < 1e-6);
  assert.ok(Math.abs(top - rect.top) < 1e-6);
  assert.ok(Math.abs(width - rect.width) < 1e-6);
  assert.ok(Math.abs(height - rect.height) < 1e-6);
  assert.ok(g.ix >= 0 && g.iy >= 0);
});
