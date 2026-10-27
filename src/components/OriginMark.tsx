import { useEffect, useRef, useState } from 'react';
import { Banknote, Cake, Dumbbell, Gift, PiggyBank, Utensils, Wallet, Watch, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { originOf, skinQuery, type OriginKind } from '@/lib/origin';
import { cn } from '@/lib/utils';
import type { SkinHit } from '@/components/SkinSearch';

const KIND_ICONS: Record<OriginKind, LucideIcon> = {
  nomina: Banknote,
  ahorro: PiggyBank,
  regalo: Gift,
  cena: Utensils,
  entrenador: Dumbbell,
  cumple: Cake,
  reloj: Watch,
};

function usable(src: string | null | undefined): src is string {
  return Boolean(src && (src.startsWith('https://') || src.startsWith('/')));
}

export function OriginGlyph({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  const origin = originOf(name);
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = usable(image) && !photoFailed ? image : '';
  const src = photo || origin?.image || '';
  useEffect(() => setPhotoFailed(false), [image]);
  const box = cn('grid shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200', className || 'h-9 w-9');
  if (src) {
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => { if (photo) setPhotoFailed(true); }} className={cn('shrink-0 rounded-xl bg-white object-contain p-0.5', className || 'h-9 w-9')} />;
  }
  const Icon = origin?.kind ? KIND_ICONS[origin.kind] : Wallet;
  return (
    <span className={box} aria-hidden>
      <Icon size={18} strokeWidth={1.75} />
    </span>
  );
}

export function OriginPicker({ name, image, onImage }: { name: string; image?: string; onImage?: (image: string) => void }) {
  const origin = originOf(name);
  const [hits, setHits] = useState<SkinHit[]>([]);
  const pick = useRef(onImage);
  pick.current = onImage;
  const fromSkin = hits.length > 0 && (!origin || origin.label === 'CS2');

  useEffect(() => {
    const text = name.trim();
    const known = origin && origin.label !== 'CS2';
    if (!pick.current || known || text.length < 3) {
      setHits([]);
      if (known && image?.startsWith('https://')) pick.current?.('');
      return;
    }
    const query = skinQuery(text);
    const wantsGloves = /guante|glove/i.test(text);
    const handle = window.setTimeout(() => {
      void api<{ results: SkinHit[] }>(`/api/market/skins?q=${encodeURIComponent(query)}`)
        .then((data) => {
          const rows = (data.results || []).filter((item) => item.image && (!wantsGloves || /glove|guante/i.test(item.name)));
          setHits(rows.slice(0, 4));
        })
        .catch(() => setHits([]));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [name, image, origin?.label]);

  if (!origin && !fromSkin && !usable(image)) return null;
  return (
    <div className="grid gap-1.5">
      {(origin || fromSkin || usable(image)) && (
        <div className="flex items-center gap-2">
          <OriginGlyph name={fromSkin && !origin ? 'CS2' : name} image={image} />
          <span className="min-w-0 text-xs font-bold text-slate-500">{usable(image) ? 'Imagen elegida' : origin?.label || 'CS2'}</span>
          {usable(image) && onImage && (
            <button type="button" onClick={() => onImage('')} className="ml-auto text-[11px] font-semibold text-slate-400">Quitar imagen</button>
          )}
        </div>
      )}
      {hits.length > 0 && onImage && (
        <ul className="grid gap-1">
          {hits.map((hit) => (
            <li key={hit.name}>
              <button type="button" onClick={() => onImage(hit.image || '')} className="flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left">
                {hit.image && <img src={hit.image} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-0.5" />}
                <span className="min-w-0 break-words text-xs font-semibold leading-snug">{hit.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
