/**
 * Vista previa aislada del Resumen (F2). Monta el Shell real (con el dock aprobado) y el
 * Dashboard real con datos sintéticos de ./fixtures.ts. Las llamadas a /api se responden
 * aquí, en el navegador: no hay servidor, base de datos ni datos reales.
 *
 * Uso en Windows: npm run dev y abrir http://localhost:5181/preview/resumen.html
 * Parámetros: ?theme=dark  ·  ?view=cartera
 * No forma parte del build de producción (vite build solo usa index.html).
 */
import { Profiler, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { Shell, type Section } from '@/components/Shell';
import { Dashboard } from '@/views/Dashboard';
import { installSquish } from '@/lib/squish';
import { previewResponse } from './fixtures';

const params = new URLSearchParams(location.search);
if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : input.url;
  if (!path.startsWith('/api')) return realFetch(input, init);
  const body = previewResponse(path, (init?.method || 'GET').toUpperCase());
  await new Promise((resolve) => setTimeout(resolve, 60));
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
localStorage.setItem('pat_token', 'preview');
installSquish();

/** Medición de renders (solo vista previa): número de commits y tiempo total por zona. */
const prof = { commits: 0, ms: 0 };
(window as unknown as { __prof: typeof prof }).__prof = prof;
const onRender = (_id: string, _phase: string, actual: number) => { prof.commits += 1; prof.ms += actual; };

function Preview() {
  const [section, setSection] = useState<Section>('dashboard');
  return (
    <Shell section={section} onChange={setSection} onTicket={() => {}} onSettled={() => {}} user={{ id: 'preview', name: 'Vista previa' } as never}>
      {section === 'dashboard' ? <Profiler id="resumen" onRender={onRender}><Dashboard heroMs={5000} home={0} books={0} /></Profiler> : <p className="p-6 text-sm text-slate-500">Solo el Resumen tiene vista previa.</p>}
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>);
