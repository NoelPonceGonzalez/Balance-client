/**
 * Vista previa de los bloques B y C: Shell y dock reales, Resumen → Carteras y Mercado REALES con datos sintéticos
 * (./fixtures-b.ts). Las llamadas a /api se responden aquí, en el navegador: sin servidor ni base de datos.
 *
 * Uso en Windows: npm run dev → http://localhost:5181/preview/app.html
 *   ?theme=dark · ?section=market|plans|movements · ?slow=800 (conexión lenta: ms por petición) · ?moves=1000
 * Medición (solo aquí): window.__net (peticiones /api) y window.__prof (commits de React).
 * No forma parte del build de producción.
 */
import { Profiler, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { Shell, type Section } from '@/components/Shell';
import { Dashboard } from '@/views/Dashboard';
import { Market } from '@/views/Market';
import { Plans } from '@/views/Plans';
import { Movements } from '@/views/Movements';
import { Settings } from '@/views/Settings';
import type { User } from '@/lib/types';
import { installSquish } from '@/lib/squish';
import { CameraLayer, useCameraPreload } from '@/components/CameraLayer';
import { previewResponseB } from './fixtures-b';
import { previewResponseC } from './fixtures-c';

const params = new URLSearchParams(location.search);
if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');
const slow = Number(params.get('slow') || 60);

const net: { path: string; at: number }[] = [];
const prof = { commits: 0, ms: 0 };
Object.assign(window, { __net: net, __prof: prof });

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : input.url;
  if (!path.startsWith('/api')) return realFetch(input, init);
  net.push({ path, at: Math.round(performance.now()) });
  const method = (init?.method || 'GET').toUpperCase();
  let body = (method === 'GET' ? previewResponseC(path) : undefined) ?? previewResponseB(path, method);
  // ?many=N (Bloque E): N cuentas sintéticas más, para probar el selector con búsqueda.
  const many = Number(params.get('many') || 0);
  if (many && method === 'GET' && path.startsWith('/api/accounts') && body && typeof body === 'object' && Array.isArray((body as { accounts?: unknown[] }).accounts)) {
    const base = (body as { accounts: Record<string, unknown>[] }).accounts;
    const extra = Array.from({ length: many }, (_, i) => ({ ...base[0], _id: `acc-prueba-${i}`, id: `acc-prueba-${i}`, name: `Cuenta de prueba ${String(i + 1).padStart(2, '0')}`, archived: false }));
    body = { ...(body as object), accounts: [...base, ...extra] };
  }
  // ?fail=ruta (Bloque E): esa ruta responde 503 (error de conexión simulado). ?empty=1: listas vacías.
  const failing = params.get('fail');
  if (failing && path.startsWith(failing)) {
    await new Promise((resolve) => setTimeout(resolve, slow));
    return new Response(JSON.stringify({ error: 'Sin conexión (simulado).' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  await new Promise<void>((resolve, reject) => {
    // ?race=1: las respuestas filtradas por la cuenta nómina tardan 900 ms más (prueba de respuestas fuera de orden).
    const late = params.get('race') === '1' && path.includes('accountId=acc-bank') ? 900 : 0;
    const timer = setTimeout(resolve, slow + late);
    init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
  });
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
localStorage.setItem('pat_token', 'preview');
installSquish();

// Cámara (Bloque D, solo aquí): cuándo se pide, cuándo llega el primer fotograma y qué pistas siguen vivas.
const cam = { tap: 0, ask: [] as number[], got: [] as number[], frame: [] as number[], tracks: [] as MediaStreamTrack[] };
Object.assign(window, { __cam: Object.assign(cam, { live: () => cam.tracks.filter((track) => track.readyState === 'live').length }) });
if (navigator.mediaDevices?.getUserMedia) {
  const ask = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    cam.ask.push(Math.round(performance.now() - cam.tap));
    const stream = await ask(constraints);
    cam.got.push(Math.round(performance.now() - cam.tap));
    cam.tracks.push(...stream.getTracks());
    return stream;
  };
}
document.addEventListener('playing', (event) => { if (event.target instanceof HTMLVideoElement) cam.frame.push(Math.round(performance.now() - cam.tap)); }, true);

const onRender = (_id: string, _phase: string, actual: number) => { prof.commits += 1; prof.ms += actual; };

function Preview() {
  const [section, setSection] = useState<Section>((params.get('section') as Section | null) || 'dashboard');
  const [ticket, setTicket] = useState(false);
  // Usuario de muestra para Ajustes (sintético; los cambios no salen del navegador).
  const [me, setMe] = useState<User>({ id: 'preview', name: 'Vista previa', email: 'vista@previa.local', username: 'vista', theme: 'system' } as User);
  useCameraPreload(true);
  return (
    <Shell section={section} onChange={setSection} onTicket={() => { cam.tap = performance.now(); setTicket(true); }} onSettled={() => {}} user={{ id: 'preview', name: 'Vista previa' } as never}>
      <Profiler id="pantalla" onRender={onRender}>
        {section === 'dashboard' && <Dashboard heroMs={5000} home={0} books={0} />}
        {section === 'market' && <Market />}
        {section === 'plans' && <Plans userId="preview" />}
        {section === 'movements' && <Movements />}
        {section === 'settings' && <Settings user={me} heroMs={5000} onHero={() => {}} onUser={(next) => { if (next) setMe(next); }} onLogout={() => {}} />}
      </Profiler>
      <CameraLayer open={ticket} userId="preview" onClose={() => setTicket(false)} onSaved={() => setTicket(false)} />
    </Shell>
  );
}

// Sin StrictMode a propósito: en desarrollo duplica efectos y peticiones, y aquí se miden (en producción no duplica).
createRoot(document.getElementById('root')!).render(<Preview />);
