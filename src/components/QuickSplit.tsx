import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, fieldClass } from '@/components/ui/Input';
import { Modal } from '@/components/Modal';
import { PlatformLogo } from '@/components/PlatformLogo';
import { api } from '@/lib/api';
import { PLATFORMS, type PlatformPreset } from '@/lib/platforms';

const KINDS = [
  { id: 'etf', label: 'ETF' },
  { id: 'crypto', label: 'Cripto' },
  { id: 'stock', label: 'Acción' },
  { id: 'other', label: 'Otro' },
] as const;

interface Line {
  assetClass: string;
  name: string;
  amount: string;
}

export function QuickSplit({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<PlatformPreset | null>(null);
  const [liquid, setLiquid] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    const key = query.trim().toLowerCase();
    const list = key ? PLATFORMS.filter((item) => item.name.toLowerCase().includes(key) || item.id.includes(key)) : PLATFORMS;
    return list.slice(0, 18);
  }, [query]);

  const save = async () => {
    if (!platform) return;
    setError('');
    setSaving(true);
    try {
      await api('/api/accounts/split', {
        method: 'POST',
        body: JSON.stringify({
          platform: platform.name,
          name: platform.name,
          kind: platform.kind,
          tracking: platform.tracking,
          liquid: liquid === '' ? 0 : Number(liquid),
          lines: lines
            .filter((line) => line.name.trim() && line.amount !== '')
            .map((line) => ({ name: line.name.trim(), assetClass: line.assetClass, amount: Number(line.amount) })),
        }),
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={platform ? platform.name : 'Añadir sitio'} onClose={onClose} wide>
      {!platform ? (
        <div>
          <Input label="Busca el sitio" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Trade Republic" autoFocus />
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {matches.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setPlatform(item); setLines([{ assetClass: 'etf', name: '', amount: '' }]); }}
                className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-center hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <PlatformLogo name={item.name} size={40} />
                <span className="line-clamp-2 text-[11px] font-bold leading-tight">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button type="button" onClick={() => setPlatform(null)} className="flex items-center gap-3 text-left">
            <PlatformLogo name={platform.name} size={44} />
            <span>
              <span className="block font-black">{platform.name}</span>
              <span className="text-xs font-bold text-indigo-600">Cambiar sitio</span>
            </span>
          </button>
          <Input label="Líquido €" type="number" step="any" value={liquid} onChange={(event) => setLiquid(event.target.value)} placeholder="Dinero sin invertir" />
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Inversiones</p>
              <div className="flex gap-1">
                {KINDS.map((kind) => (
                  <button key={kind.id} type="button" onClick={() => setLines([...lines, { assetClass: kind.id, name: '', amount: '' }])} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    + {kind.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="grid grid-cols-[6.5rem_1fr_7rem_auto] gap-2">
                  <select className={fieldClass} value={line.assetClass} onChange={(event) => setLines(lines.map((item, i) => (i === index ? { ...item, assetClass: event.target.value } : item)))}>
                    {KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
                  </select>
                  <Input placeholder={line.assetClass === 'crypto' ? 'Bitcoin' : 'VWCE'} value={line.name} onChange={(event) => setLines(lines.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))} />
                  <Input type="number" step="any" placeholder="Importe €" value={line.amount} onChange={(event) => setLines(lines.map((item, i) => (i === index ? { ...item, amount: event.target.value } : item)))} />
                  <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== index))} className="px-2 text-sm font-black text-slate-400" aria-label="Quitar línea">×</button>
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      )}
    </Modal>
  );
}
