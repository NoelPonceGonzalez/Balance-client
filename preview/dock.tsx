/**
 * Vista previa del dock adaptativo (F6, prototipo). Shell y dock reales; Resumen real con datos
 * sintéticos; Mercado, Movimientos y Planes son pantallas sintéticas con la longitud típica de cada una
 * (no son las vistas reales: aquí solo importa cómo responde el dock a su scroll).
 *
 * Uso en Windows: npm run dev → http://localhost:5181/preview/dock.html  (?theme=dark · ?section=market)
 * No forma parte del build de producción.
 */
import { StrictMode, useState } from 'react';
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

const TICKERS = ['MSCI World', 'S&P 500', 'Bitcoin', 'Ethereum', 'Apple', 'Nvidia', 'Microsoft', 'Oro', 'Solana', 'Amazon', 'Tesla', 'Euro Stoxx 50'];

function rows(count: number, seed: number) {
  return Array.from({ length: count }, (_, index) => {
    const n = (Math.sin((index + 1) * seed) + 1) / 2;
    return { index, n, up: n > 0.45 };
  });
}

function MarketScreen() {
  return (
    <div className="mx-auto max-w-3xl pb-28">
      <h1 className="pt-2 text-[28px] font-semibold tracking-tight">Mercado</h1>
      <input data-dock-ignore placeholder="Buscar activo" className="mt-3 h-10 w-full rounded-xl bg-slate-100 px-3 text-[15px] outline-none dark:bg-white/10" />
      <div className="market-pills no-scrollbar -mx-3 mt-3 flex gap-2 overflow-x-auto px-3">
        {['Todo', 'Acciones', 'ETF', 'Cripto', 'Materias primas', 'Divisas', 'Skins'].map((label, index) => (
          <span key={label} className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ${index === 0 ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>{label}</span>
        ))}
      </div>
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/10">
        {rows(48, 1.7).map(({ index, n, up }) => (
          <li key={index} className="flex items-center justify-between py-3.5">
            <span>
              <span className="block text-[15px] font-semibold">{TICKERS[index % TICKERS.length]}</span>
              <span className="block text-[13px] text-slate-400">Cotización sintética #{index + 1}</span>
            </span>
            <span className="text-right tabular-nums">
              <span className="block text-[15px] font-semibold">{(40 + n * 900).toFixed(2)} €</span>
              <span className={`block text-[13px] font-semibold ${up ? 'text-[#16c784]' : 'text-[#ea3943]'}`}>{up ? '+' : '−'}{(n * 4).toFixed(2)} %</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MovementsScreen() {
  return (
    <div className="mx-auto max-w-3xl pb-28">
      <div className="sticky -top-2 z-20 -mx-3 bg-[var(--app-bg)] px-3 py-2">
        <h1 className="text-[28px] font-semibold tracking-tight">Movimientos</h1>
        {/* Misma estructura que la pantalla real: el buscador vive dentro de «Buscar y fechas». */}
        <details className="mt-1">
          <summary className="cursor-pointer text-[13px] font-semibold text-slate-400">Buscar y fechas</summary>
          <label className="mt-2 block text-[13px] font-semibold text-slate-500">Buscar
            <input placeholder="Descripción o categoría" className="mt-1 h-10 w-full rounded-xl bg-slate-100 px-3 text-[15px] outline-none dark:bg-white/10" />
          </label>
        </details>
        <div className="mt-2 flex gap-2 text-[13px] font-semibold">
          {['Todos', 'Entradas', 'Salidas', 'Inversión'].map((label, index) => (
            <span key={label} className={`rounded-full px-3 py-1.5 ${index === 0 ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>{label}</span>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-white/10">
        {rows(80, 2.3).map(({ index, n, up }) => (
          <li key={index} className="flex items-center justify-between py-3">
            <span>
              <span className="block text-[15px] font-semibold">{up ? 'Ingreso' : 'Pago'} sintético {index + 1}</span>
              <span className="block text-[13px] text-slate-400">{(index % 28) + 1} nov 2026</span>
            </span>
            <span className={`text-[15px] font-semibold tabular-nums ${up ? 'text-[#16c784]' : ''}`}>{up ? '+' : '−'}{(5 + n * 300).toFixed(2)} €</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlansScreen() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-28">
      <h1 className="pt-2 text-[28px] font-semibold tracking-tight">Planes</h1>
      {['Viaje a Lisboa', 'Fondo de emergencia', 'Tandas de MSCI World'].map((name, index) => (
        <div key={name} className="rounded-3xl bg-white p-4 ring-1 ring-slate-200/70 dark:bg-white/5 dark:ring-white/10">
          <p className="text-[15px] font-semibold">{name}</p>
          <p className="mt-1 text-[13px] text-slate-400">Plan sintético · {[42, 68, 15][index]} % completado</p>
          <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-slate-950 dark:bg-white" style={{ width: `${[42, 68, 15][index]}%` }} /></div>
        </div>
      ))}
      <p className="pt-2 text-center text-[13px] text-slate-400">Pantalla corta: el dock se queda expandido.</p>
    </div>
  );
}

function Preview() {
  const start = (params.get('section') as Section | null) || 'dashboard';
  const [section, setSection] = useState<Section>(start);
  return (
    <Shell section={section} onChange={setSection} onTicket={() => {}} onSettled={() => {}} user={{ id: 'preview', name: 'Vista previa' } as never}>
      {section === 'dashboard' && <Dashboard heroMs={5000} home={0} books={0} />}
      {section === 'market' && <MarketScreen />}
      {section === 'movements' && <MovementsScreen />}
      {section === 'plans' && <PlansScreen />}
      {section === 'settings' && <p className="p-6 text-sm text-slate-500">Ajustes (no incluido en la vista previa).</p>}
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>);
