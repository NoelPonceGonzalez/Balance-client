import { test } from 'node:test';
import assert from 'node:assert/strict';

// Entorno mínimo de navegador para api(): sin red real, respuestas controladas.
const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); } };
Object.assign(globalThis, { localStorage: storage, sessionStorage: storage, window: { dispatchEvent: () => true } });

let calls: string[] = [];
let value = 1;
globalThis.fetch = (async (input: string, init?: RequestInit) => {
  calls.push(`${init?.method || 'GET'} ${input}`);
  await new Promise((resolve) => setTimeout(resolve, 5));
  return new Response(JSON.stringify({ value }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const { api } = await import('./api.ts');
const { cachedApi, peek, ageOf } = await import('./query.ts');

test('dos lecturas simultáneas comparten una sola petición', async () => {
  calls = [];
  const [a, b] = await Promise.all([cachedApi<{ value: number }>('/api/a'), cachedApi<{ value: number }>('/api/a')]);
  assert.equal(calls.length, 1);
  assert.deepEqual(a, b);
});

test('una respuesta reciente se reutiliza sin red; force vuelve a pedir', async () => {
  calls = [];
  await cachedApi('/api/b', { maxAge: 60_000 });
  await cachedApi('/api/b', { maxAge: 60_000 });
  assert.equal(calls.length, 1);
  await cachedApi('/api/b', { maxAge: 60_000, force: true });
  assert.equal(calls.length, 2);
  assert.ok((ageOf('/api/b') ?? Infinity) < 1000);
});

test('cualquier escritura vacía la caché', async () => {
  value = 1;
  await cachedApi('/api/c', { maxAge: 60_000 });
  assert.deepEqual(peek('/api/c'), { value: 1 });
  await api('/api/c', { method: 'POST', body: '{}' });
  assert.equal(peek('/api/c'), undefined);
});

test('una lectura que vuela durante una escritura no se guarda', async () => {
  const pending = cachedApi('/api/d', { maxAge: 60_000 });
  await api('/api/x', { method: 'DELETE' });
  await pending;
  assert.equal(peek('/api/d'), undefined);
});
