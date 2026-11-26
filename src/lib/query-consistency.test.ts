import { test } from 'node:test';
import assert from 'node:assert/strict';

// Bloque E · consistencia de la caché: respuestas viejas, fuera de orden, sesiones y errores.
const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); } };
Object.assign(globalThis, { localStorage: storage, sessionStorage: storage, window: { dispatchEvent: () => true } });

// Cada petición GET responde con lo que diga `answers[path]` en el momento de responder, tras `delays[path]` ms.
const answers = new Map<string, unknown>();
const delays = new Map<string, number>();
let fail = false;
let calls = 0;
globalThis.fetch = (async (input: string, init?: RequestInit) => {
  calls += 1;
  const path = String(input);
  const wait = (init?.method || 'GET') === 'GET' ? delays.get(path) ?? 5 : 1;
  await new Promise((resolve) => setTimeout(resolve, wait));
  if (fail && (init?.method || 'GET') === 'GET') return new Response(JSON.stringify({ error: 'caída' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify(answers.get(path) ?? {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const { api } = await import('./api.ts');
const { cachedApi, peek } = await import('./query.ts');

test('una respuesta vieja que llega tarde no borra ni pisa la nueva', async () => {
  memory.set('pat_token', 'ana');
  delays.set('/api/r', 40);
  answers.set('/api/r', { v: 'viejo' });
  const old = cachedApi<{ v: string }>('/api/r');
  await api('/api/w', { method: 'POST', body: '{}' }); // escritura: lo anterior deja de valer
  answers.set('/api/r', { v: 'nuevo' });
  delays.set('/api/r', 5);
  const fresh = await cachedApi<{ v: string }>('/api/r');
  assert.deepEqual(fresh, { v: 'nuevo' });
  await old; // la vieja llega después
  assert.deepEqual(peek('/api/r'), { v: 'nuevo' });
});

test('los datos de una sesión no aparecen en la siguiente', async () => {
  memory.set('pat_token', 'ana');
  answers.set('/api/s', { de: 'ana' });
  await cachedApi('/api/s', { maxAge: 60_000 });
  assert.deepEqual(peek('/api/s'), { de: 'ana' });
  memory.delete('pat_token'); // cierre de sesión
  assert.equal(peek('/api/s'), undefined);
  memory.set('pat_token', 'luis'); // entra otra persona
  answers.set('/api/s', { de: 'luis' });
  assert.equal(peek('/api/s'), undefined);
  assert.deepEqual(await cachedApi('/api/s', { maxAge: 60_000 }), { de: 'luis' });
});

test('una lectura de la sesión anterior que llega tarde no queda para la nueva', async () => {
  memory.set('pat_token', 'ana');
  delays.set('/api/t', 30);
  answers.set('/api/t', { de: 'ana' });
  const late = cachedApi('/api/t', { maxAge: 60_000 });
  memory.set('pat_token', 'luis');
  assert.equal(peek('/api/t'), undefined); // al mirar, la caché ya es de luis
  await late;
  assert.equal(peek('/api/t'), undefined);
});

test('un error no borra lo último bueno ni se guarda como dato', async () => {
  memory.set('pat_token', 'ana');
  delays.set('/api/u', 5);
  answers.set('/api/u', { ok: 1 });
  await cachedApi('/api/u');
  fail = true;
  await assert.rejects(cachedApi('/api/u', { force: true }));
  fail = false;
  assert.deepEqual(peek('/api/u'), { ok: 1 });
});

test('muchas lecturas a la vez de la misma ruta: una sola petición', async () => {
  memory.set('pat_token', 'ana');
  delays.set('/api/v', 15);
  const before = calls;
  await Promise.all(Array.from({ length: 6 }, () => cachedApi('/api/v', { maxAge: 15_000 })));
  assert.equal(calls - before, 1);
});
