import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Ejecuta el service worker real (public/sw.js) con un entorno simulado: nada sale a la red ni al móvil.
const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const store = new Map<string, Map<string, string>>();
  const shown: { title: string; options: { body?: string; image?: string; tag?: string } }[] = [];
  const caches = {
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const bucket = store.get(name)!;
      return {
        put: async (key: string, response: Response) => { bucket.set(key, await response.text()); },
        match: async (key: string) => (bucket.has(key) ? new Response(bucket.get(key)) : undefined),
      };
    },
  };
  const self = {
    location: { origin: 'https://balance.test' },
    addEventListener: (type: string, fn: (event: unknown) => void) => handlers.set(type, fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined, matchAll: async () => [], openWindow: async () => undefined },
    registration: { showNotification: async (title: string, options: object) => { shown.push({ title, options }); } },
  };
  vm.runInNewContext(source, { self, caches, Response, URL, Date, console });
  const fire = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    handlers.get(type)?.({ ...event, waitUntil: (promise: Promise<unknown>) => waits.push(promise) });
    await Promise.all(waits);
  };
  const push = (payload: object) => fire('push', { data: { json: () => payload, text: () => JSON.stringify(payload) } });
  return { fire, push, shown, store };
}

const FINANCIAL = { title: 'SAP sube un 4,8 %', body: 'Lo tienes. Ahora está en 182,40 €.', url: '/', image: 'https://x/sap.png', tag: 'move:sap', u: 'aaaa' };

test('un aviso para la sesión abierta se enseña entero', async () => {
  const sw = worker();
  await sw.fire('message', { data: { type: 'balance-user', audience: 'aaaa' } });
  await sw.push(FINANCIAL);
  assert.equal(sw.shown[0].title, 'SAP sube un 4,8 %');
});

test('un aviso de la cuenta anterior llega sin datos financieros', async () => {
  const sw = worker();
  await sw.fire('message', { data: { type: 'balance-user', audience: 'bbbb' } });
  await sw.push(FINANCIAL);
  assert.equal(sw.shown[0].title, 'Balance');
  assert.doesNotMatch(sw.shown[0].options.body || '', /€|SAP|%/);
  assert.equal(sw.shown[0].options.image, undefined);
});

test('sin sesión abierta tampoco se enseña el detalle', async () => {
  const sw = worker();
  await sw.fire('message', { data: { type: 'balance-user', audience: 'none' } });
  await sw.push(FINANCIAL);
  assert.equal(sw.shown[0].title, 'Balance');
});

test('compatibilidad: sin dato de sesión o sin huella en el aviso, como antes', async () => {
  const sw = worker();
  await sw.push(FINANCIAL);
  const other = worker();
  await other.fire('message', { data: { type: 'balance-user', audience: 'bbbb' } });
  await other.push({ ...FINANCIAL, u: undefined });
  assert.equal(sw.shown[0].title, 'SAP sube un 4,8 %');
  assert.equal(other.shown[0].title, 'SAP sube un 4,8 %');
});

test('una nueva versión del worker conserva la sesión y borra el resto de cachés', async () => {
  const sw = worker();
  await sw.fire('message', { data: { type: 'balance-user', audience: 'aaaa' } });
  sw.store.set('vieja', new Map());
  await sw.fire('activate', {});
  assert.deepEqual([...sw.store.keys()], ['balance-session']);
});

test('la huella del cliente coincide con la del servidor', async () => {
  const { pushAudience } = await import('./push-audience.ts');
  assert.equal(await pushAudience('665f0c2a9b1e4d0012345678'), 'c7eee0bbae6f0823');
});
