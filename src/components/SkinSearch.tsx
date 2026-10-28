import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';

export interface SkinPhase {
  id: string;
  label: string;
  paintIndex: number;
}

export interface SkinHit {
  name: string;
  image: string | null;
  wears: string[];
  phases: SkinPhase[];
}

const WEAR_LABEL: Record<string, string> = {
  'Factory New': 'Recién fabricada',
  'Minimal Wear': 'Casi nueva',
  'Field-Tested': 'Algo desgastada',
  'Well-Worn': 'Bastante desgastada',
  'Battle-Scarred': 'Muy desgastada',
};

export function wearFromFloat(value: number): string | null {
  if (!(value >= 0 && value <= 1)) return null;
  if (value < 0.07) return 'Factory New';
  if (value < 0.15) return 'Minimal Wear';
  if (value < 0.38) return 'Field-Tested';
  if (value < 0.45) return 'Well-Worn';
  return 'Battle-Scarred';
}

export function wearName(floatText: string): string {
  const value = Number(floatText.trim().replace(',', '.'));
  const wear = wearFromFloat(value);
  return wear ? WEAR_LABEL[wear] || wear : '';
}

export function wearHint(floatText: string, wears: string[]): string {
  const text = floatText.trim().replace(',', '.');
  if (!text) return 'Un float aproximado basta, por ejemplo 0,15.';
  const value = Number(text);
  const wear = wearFromFloat(value);
  if (!wear) return 'Un float aproximado basta, por ejemplo 0,15.';
  const label = WEAR_LABEL[wear] || wear;
  if (wears.length > 0 && !wears.includes(wear)) {
    return `Ese float cae en ${label}. Si esta skin no se vende así, no pongo un precio.`;
  }
  return `Con este float se mira ${label} y las ventas de float parecido.`;
}

export function SkinSearch({ onPick }: { onPick: (hit: SkinHit) => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SkinHit[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setHits([]);
      setStatus('');
      return;
    }
    const handle = window.setTimeout(() => {
      void api<{ results: SkinHit[] }>(`/api/market/skins?q=${encodeURIComponent(text)}`)
        .then((data) => {
          setHits(data.results);
          setStatus(data.results.length ? '' : `Ninguna skin coincide con «${text}».`);
        })
        .catch(() => setStatus('La búsqueda no ha respondido.'));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <div className="grid gap-2">
      <Input label="Buscar skin" value={query} placeholder="AK Redline, Printstream…" onChange={(event) => setQuery(event.target.value)} />
      {status && <p className="text-xs font-medium text-slate-400">{status}</p>}
      {hits.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {hits.map((hit) => (
            <li key={hit.name}>
              <button
                type="button"
                onClick={() => {
                  onPick(hit);
                  setQuery('');
                  setHits([]);
                  setStatus('');
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5"
              >
                {hit.image && <img src={hit.image} alt="" referrerPolicy="no-referrer" className="h-10 w-14 shrink-0 rounded-lg bg-slate-100 object-contain p-0.5 dark:bg-white/10" />}
                <span className="min-w-0 break-words text-sm font-semibold leading-snug">{hit.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
