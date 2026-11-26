import { test } from 'node:test';
import assert from 'node:assert/strict';

// Aislamiento entre usuarios: con otra sesión, nada de lo guardado se ve.
const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); } };
Object.assign(globalThis, { localStorage: storage, sessionStorage: storage, window: { dispatchEvent: () => true } });
memory.set('pat_token', 'usuario-a');
globalThis.fetch = (async () => new Response(JSON.stringify({ who: memory.get('pat_token') }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

const { cachedApi, peek, onCacheReset } = await import('./query.ts');

test('al cambiar de sesión la caché se vacía y avisa', async () => {
  let resets = 0;
  onCacheReset(() => { resets += 1; });
  await cachedApi('/api/wallets', { maxAge: 60_000 });
  assert.deepEqual(peek('/api/wallets'), { who: 'usuario-a' });
  memory.set('pat_token', 'usuario-b');
  assert.equal(peek('/api/wallets'), undefined);
  assert.equal(resets, 1);
  assert.deepEqual(await cachedApi('/api/wallets', { maxAge: 60_000 }), { who: 'usuario-b' });
});

test('una respuesta pedida por la sesión anterior no se guarda para la nueva', async () => {
  memory.set('pat_token', 'usuario-c');
  const pending = cachedApi('/api/plans', { maxAge: 60_000 });
  memory.set('pat_token', 'usuario-d');
  peek('/api/otra');
  await pending;
  assert.equal(peek('/api/plans'), undefined);
});
