/**
 * Vista previa del Bloque B: Shell y dock reales, Resumen → Carteras y Mercado REALES con datos sintéticos
 * (./fixtures-b.ts). Las llamadas a /api se responden aquí, en el navegador: sin servidor ni base de datos.
 *
 * Uso en Windows: npm run dev → http://localhost:5181/preview/app.html
 *   ?theme=dark · ?section=market · ?slow=800 (conexión lenta: ms por petición)
 * Medición (solo aquí): window.__net (peticiones /api) y window.__prof (commits de React).
 * No forma parte del build de producción.
 */
import { Profiler, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { Shell, type Section } from '@/components/Shell';
import { Dashboard } from '@/views/Dashboard';
import { Market } from '@/views/Market';
import { installSquish } from '@/lib/squish';
import { previewResponseB } from './fixtures-b';

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
  const body = previewResponseB(path, (init?.method || 'GET').toUpperCase());
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, slow);
    init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
  });
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
localStorage.setItem('pat_token', 'preview');
installSquish();

const onRender = (_id: string, _phase: string, actual: number) => { prof.commits += 1; prof.ms += actual; };

function Preview() {
  const [section, setSection] = useState<Section>((params.get('section') as Section | null) || 'dashboard');
  return (
    <Shell section={section} onChange={setSection} onTicket={() => {}} onSettled={() => {}} user={{ id: 'preview', name: 'Vista previa' } as never}>
      <Profiler id="pantalla" onRender={onRender}>
        {section === 'dashboard' && <Dashboard heroMs={5000} home={0} books={0} />}
        {section === 'market' && <Market />}
        {(section === 'plans' || section === 'movements' || section === 'settings') && <p className="p-6 text-sm text-slate-500">Esta pantalla no forma parte de la vista previa del Bloque B.</p>}
      </Profiler>
    </Shell>
  );
}

// Sin StrictMode a propósito: en desarrollo duplica efectos y peticiones, y aquí se miden (en producción no duplica).
createRoot(document.getElementById('root')!).render(<Preview />);
