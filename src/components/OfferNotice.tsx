import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, type AnimationPlaybackControls } from 'motion/react';
import { ModalClose, modalOverlayClass, modalPanelClass } from '@/components/Modal';
import { api, ApiError } from '@/lib/api';
import { formatDay, formatEur } from '@/lib/format';
import { glide, jelly, quickOut } from '@/lib/motion';
import { skinArt, skinArtSteam } from '@/lib/skin-art';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/lib/types';

const SKIP = 'pat_offer_skip';
const PASSED = 'pat_offer_passed';
const OFFER_LIMIT = 10;
const offerSkipWatchers = new Set<() => void>();

export function watchOfferSkips(onChange: () => void): () => void {
  offerSkipWatchers.add(onChange);
  return () => { offerSkipWatchers.delete(onChange); };
}

function skippedIds(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SKIP) || '[]') as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function rememberSkip(id: string) {
  const next = skippedIds();
  next.add(id);
  localStorage.setItem(SKIP, JSON.stringify([...next]));
  offerSkipWatchers.forEach((notify) => notify());
}

type PassedOffer = { listing: string; price: number };

function readPassed(): PassedOffer[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PASSED) || '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const listing = (row as PassedOffer).listing;
      const price = (row as PassedOffer).price;
      return typeof listing === 'string' && typeof price === 'number' ? [{ listing, price }] : [];
    });
  } catch {
    return [];
  }
}

function rememberPassed(item: AppNotification) {
  rememberSkip(item.id);
  const listing = listingOf(item.quoteKey);
  if (!listing || item.priceEur == null) return;
  const next = [...readPassed(), { listing, price: item.priceEur }].slice(-200);
  localStorage.setItem(PASSED, JSON.stringify(next));
}

function listingOf(quoteKey: string | null | undefined): string | null {
  return quoteKey?.match(/csfloat:([^:]+)/)?.[1] ?? null;
}

// El aviso de Skinport guarda el precio pero no el float. Estos son los del anuncio concreto, leídos de su ficha.
const SKINPORT_LISTING: Record<string, { floatValue: number; paintSeed: number }> = {
  'sport-gloves-nocts-field-tested@450': { floatValue: 0.365846186876297, paintSeed: 276 },
  'sport-gloves-nocts-field-tested@454.51': { floatValue: 0.35444554686546326, paintSeed: 68 },
};

function listedFloat(url: string | null | undefined, quoteKey: string | null | undefined): { floatValue: number; paintSeed: number } | null {
  const slug = url?.match(/skinport\.com\/item\/([^/?#]+)/)?.[1];
  const ask = quoteKey?.match(/skinport:([\d.]+)/)?.[1];
  if (!slug || !ask) return null;
  return SKINPORT_LISTING[`${slug}@${ask}`] ?? null;
}

function dismissed(item: AppNotification, skip: Set<string>, passed: PassedOffer[]): boolean {
  if (skip.has(item.id)) return true;
  const listing = listingOf(item.quoteKey);
  const price = item.priceEur;
  if (!listing || price == null) return false;
  return passed.some((row) => row.listing === listing && Math.abs(row.price - price) < 1);
}

export function rankedOffers(items: AppNotification[]): AppNotification[] {
  const skip = skippedIds();
  const passed = readPassed();
  return items
    .filter((item) => item.quoteKey?.startsWith('listing:') && !dismissed(item, skip, passed) && listingStillUp(item.url))
    .sort((a, b) => (a.priceEur ?? Number.POSITIVE_INFINITY) - (b.priceEur ?? Number.POSITIVE_INFINITY) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, OFFER_LIMIT);
}

export function nextOffer(items: AppNotification[]): AppNotification | null {
  return rankedOffers(items)[0] || null;
}

function listingId(url: string | null | undefined): string | null {
  return url?.match(/csfloat\.com\/item\/(\d+)/)?.[1] ?? null;
}

type LiveQuote = { referenceEur: number | null; paintSeed: number | null; state: string; floatValue?: number | null; pictures?: string[] };

function listingPictures(photos: string[] | undefined, image: string | null | undefined): string[] {
  const shot = photos?.[0]?.match(/\/m\/(\d+)\/playside\.png/)?.[1];
  const list = [shot ? `https://s.csfloat.com/m/${shot}/playside.png` : '', photos?.[0] || '', image || ''];
  return [...new Set(list.filter((url) => /^https:\/\//.test(url)))];
}

const liveQuotes = new Map<string, LiveQuote>();
const liveWatchers = new Set<() => void>();

function publishLive(id: string, row: LiveQuote) {
  const prev = liveQuotes.get(id);
  liveQuotes.set(id, row);
  if (prev?.state === row.state) return;
  liveWatchers.forEach((notify) => notify());
}

export function watchListings(onChange: () => void): () => void {
  liveWatchers.add(onChange);
  return () => { liveWatchers.delete(onChange); };
}

function listingStillUp(url: string | null | undefined): boolean {
  const id = listingId(url);
  if (!id) return true;
  const row = liveQuotes.get(id);
  return !row || row.state === 'listed';
}

function dealPct(price: number | null | undefined, reference: number | null | undefined): number | null {
  if (price == null || reference == null || !(reference > 0)) return null;
  return Math.round(((price - reference) / reference) * 1000) / 10;
}

function saleMoment(item: AppNotification): string {
  const match = item.quoteKey?.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/);
  return match?.[1] || item.createdAt;
}

function offerName(title: string): { name: string; below: string } {
  const [name, below] = title.split(' por debajo de ');
  return { name: name || title, below: below || '' };
}

const WEAR_BANDS = [
  { wear: 'Factory New', short: 'FN', from: 0, to: 0.07 },
  { wear: 'Minimal Wear', short: 'MW', from: 0.07, to: 0.15 },
  { wear: 'Field-Tested', short: 'FT', from: 0.15, to: 0.38 },
  { wear: 'Well-Worn', short: 'WW', from: 0.38, to: 0.45 },
  { wear: 'Battle-Scarred', short: 'BS', from: 0.45, to: 1 },
];

function wearOf(floatValue: number): string {
  return (WEAR_BANDS.find((row) => floatValue < row.to) ?? WEAR_BANDS[WEAR_BANDS.length - 1]).short;
}

function floatText(value: number): string {
  return value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function wearOfHash(hash: string | undefined): string | null {
  return hash?.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/)?.[1] ?? null;
}

function baseOfHash(hash: string): string {
  return hash.replace(/^★\s*/, '').replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/, '');
}

function readShift(node: HTMLElement): { x: number; y: number } {
  const raw = getComputedStyle(node).transform;
  if (!raw || raw === 'none') return { x: 0, y: 0 };
  const match = raw.match(/matrix(?:3d)?\(([^)]+)\)/);
  if (!match) return { x: 0, y: 0 };
  const parts = match[1].split(',').map((part) => Number(part.trim()));
  return parts.length === 16 ? { x: parts[12] || 0, y: parts[13] || 0 } : { x: parts[4] || 0, y: parts[5] || 0 };
}

export function OfferNotice({ focused = null, onFocusedClose }: { focused?: AppNotification | null; onFocusedClose?: () => void }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [ceilings, setCeilings] = useState<Record<string, number>>({});
  const [skip, setSkip] = useState<Set<string>>(() => skippedIds());
  const [passed, setPassed] = useState<PassedOffer[]>(() => readPassed());
  const [aside, setAside] = useState(false);
  const [visit, setVisit] = useState(0);
  const [index, setIndex] = useState(0);
  const [nudge, setNudge] = useState(0);
  const [dragOn, setDragOn] = useState(false);
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const dragOrigin = useRef<{ x: number; y: number; baseX: number; baseY: number } | null>(null);
  const dragAxis = useRef<'x' | 'y' | null>(null);
  const enterRun = useRef<AnimationPlaybackControls | null>(null);
  const caught = useRef(false);
  const placeRef = useRef(0);
  const deckLenRef = useRef(0);
  const deckReady = useRef('');
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;
  const [misses, setMisses] = useState<Record<string, number>>({});
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [wearRefs, setWearRefs] = useState<Record<string, number | null>>({});
  const asked = useRef(new Set<string>());

  useEffect(() => {
    const pending = [...new Set(Object.values(hashes))].filter((hash) => wearOfHash(hash) && !asked.current.has(hash));
    for (const hash of pending) {
      asked.current.add(hash);
      const base = baseOfHash(hash);
      const wear = wearOfHash(hash);
      api<{ results?: { name: string; wears: { wear: string; refEur: number | null }[] }[] }>(`/api/market/csfloat/catalog?q=${encodeURIComponent(base.replace(' | ', ' '))}`)
        .then((data) => {
          const row = (data.results || []).find((item) => item.name.replace(/^★\s*/, '') === base);
          const ref = row?.wears.find((item) => item.wear === wear)?.refEur ?? null;
          setWearRefs((prev) => ({ ...prev, [hash]: ref && ref > 0 ? ref : null }));
        })
        .catch(() => asked.current.delete(hash));
    }
  }, [hashes]);

  useEffect(() => {
    let cancelled = false;
    let noticeTry = 0;
    let noticeTimer = 0;
    const loadNotices = () => {
      api<{ notifications: AppNotification[] }>('/api/market/notifications')
        .then((data) => {
          if (!cancelled) setItems(data.notifications || []);
        })
        .catch(() => {
          if (cancelled || noticeTry >= 4) return;
          noticeTry += 1;
          noticeTimer = window.setTimeout(loadNotices, 3000 * noticeTry);
        });
    };
    loadNotices();
    let retry = 0;
    let retryTimer = 0;
    const refreshCeilings = () => {
      api<{ purchases?: { id: string; belowEur: number; hash?: string }[] }>('/api/market')
        .then((data) => {
          if (cancelled) return;
          const next: Record<string, number> = {};
          const names: Record<string, string> = {};
          for (const row of data.purchases || []) {
            if (row.id && row.belowEur > 0) next[row.id] = row.belowEur;
            if (row.id && row.hash) names[row.id] = row.hash;
          }
          setCeilings(next);
          setHashes(names);
        })
        .catch(() => {
          if (cancelled || retry >= 3) return;
          retry += 1;
          retryTimer = window.setTimeout(refreshCeilings, 4000 * retry);
        });
    };
    refreshCeilings();
    window.addEventListener('pat-alerts', refreshCeilings);
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(noticeTimer);
      window.removeEventListener('pat-alerts', refreshCeilings);
    };
  }, [visit]);

  useEffect(() => {
    let away = false;
    const onHide = () => {
      if (document.visibilityState === 'hidden') away = true;
      if (document.visibilityState === 'visible' && away) {
        away = false;
        setAside(false);
        setVisit((value) => value + 1);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const unique: AppNotification[] = [];
  const buckets = new Set<string>();
  for (const item of items) {
    if (!item.quoteKey?.startsWith('listing:')) continue;
    const listing = listingOf(item.quoteKey);
    const token = listing && item.priceEur != null ? `${listing}:${Math.round(item.priceEur)}` : item.id;
    if (buckets.has(token)) continue;
    buckets.add(token);
    if (!listingStillUp(item.url)) continue;
    unique.push(item);
  }
  unique.sort((a, b) => (a.priceEur ?? Number.POSITIVE_INFINITY) - (b.priceEur ?? Number.POSITIVE_INFINITY) || a.createdAt.localeCompare(b.createdAt));
  const picked = focused?.quoteKey?.startsWith('listing:') ? focused : null;
  const deck = unique.filter((item) => !dismissed(item, skip, passed)).slice(0, OFFER_LIMIT);
  if (picked && listingStillUp(picked.url) && !deck.some((item) => item.id === picked.id)) {
    deck.unshift(picked);
    deck.splice(OFFER_LIMIT);
  }
  const sourceKey = unique.map((item) => item.id).join('|');
  const focusId = picked?.id || '';
  const place = deck.length === 0 ? 0 : Math.min(index, deck.length - 1);
  const shown = deck[place] || null;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const open = Boolean(shown) && (Boolean(picked) || !aside);
  placeRef.current = place;
  deckLenRef.current = deck.length;

  useEffect(() => {
    if (focusId) {
      const at = deck.findIndex((item) => item.id === focusId);
      if (at >= 0) setIndex(at);
      setNudge(0);
      return;
    }
    const token = `${visit}:${sourceKey}`;
    if (!sourceKey || deckReady.current === token) return;
    if (!deck.length) return;
    deckReady.current = token;
    setIndex(0);
    setNudge(0);
  }, [visit, sourceKey, focusId]);

  const stopFlight = () => {
    const run = enterRun.current;
    enterRun.current = null;
    run?.stop();
  };
  const leave = () => {
    stopFlight();
    setDragOn(false);
    setNudge(0);
    if (picked) onFocusedClose?.();
    setAside(true);
  };
  const grab = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const shift = readShift(event.currentTarget);
    stopFlight();
    dragX.set(shift.x);
    dragY.set(shift.y);
    setDragOn(true);
    caught.current = Math.abs(shift.x) > 0.5 || Math.abs(shift.y) > 0.5;
    dragOrigin.current = { x: event.clientX, y: event.clientY, baseX: shift.x, baseY: shift.y };
    dragAxis.current = null;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* el gesto sigue aunque el puntero no se pueda capturar */ }
  };
  const pull = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (!dragAxis.current && Math.hypot(dx, dy) > 8) dragAxis.current = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    if (dragAxis.current === 'y') dragY.set(Math.max(0, origin.baseY + dy));
    else if (dragAxis.current === 'x') dragX.set(origin.baseX + dx);
    else {
      dragX.set(origin.baseX + dx);
      dragY.set(Math.max(0, origin.baseY + dy));
    }
  };
  const drop = () => {
    const origin = dragOrigin.current;
    if (!origin) return;
    const gestureX = dragX.get() - origin.baseX;
    const gestureY = dragY.get() - origin.baseY;
    const axis = dragAxis.current;
    const wasCaught = caught.current;
    dragOrigin.current = null;
    dragAxis.current = null;
    caught.current = false;
    const stick = still ? { duration: 0 } : glide;
    if (!axis) {
      if (wasCaught || Math.abs(dragX.get()) > 0.5 || Math.abs(dragY.get()) > 0.5) {
        enterRun.current = animate(dragX, 0, stick);
        void animate(dragY, 0, stick);
      }
      return;
    }
    if (axis === 'y') {
      if (gestureY > 88) leave();
      else {
        enterRun.current = animate(dragY, 0, stick);
        if (Math.abs(dragX.get()) > 0.5) void animate(dragX, 0, stick);
      }
      return;
    }
    if ((gestureX <= -72 || gestureX >= 72) && deck.length > 1) {
      const step = gestureX < 0 ? 1 : -1;
      stopFlight();
      dragX.set(0);
      dragY.set(0);
      setDragOn(false);
      setNudge(step);
      setIndex((place + step + deck.length) % deck.length);
      return;
    }
    enterRun.current = animate(dragX, 0, stick);
    if (Math.abs(dragY.get()) > 0.5) void animate(dragY, 0, stick);
  };
  const pass = () => {
    if (!shown) return;
    const id = shown.id;
    const remaining = deck.filter((item) => item.id !== id).length;
    rememberPassed(shown);
    setDragOn(false);
    setNudge(0);
    setSkip(skippedIds());
    setPassed(readPassed());
    if (remaining === 0) leave();
    void api(`/api/market/notifications/${id}/pass`, { method: 'POST' }).catch(() => undefined);
  };
  const interest = () => {
    if (!shown?.url) return;
    const id = shown.id;
    const url = shown.url;
    window.open(url, '_blank', 'noopener,noreferrer');
    void api(`/api/market/notifications/${id}/keep`, { method: 'POST' }).catch(() => undefined);
    leave();
  };

  const candidateKey = items.filter((item) => item.quoteKey?.startsWith('listing:')).map((item) => item.id).join('|');
  const checked = useRef(new Set<string>());
  const checkedVisit = useRef(visit);
  useEffect(() => {
    if (checkedVisit.current !== visit) {
      checkedVisit.current = visit;
      checked.current = new Set();
    }
    const ids = [...new Set(items.flatMap((item) => {
      const id = item.quoteKey?.startsWith('listing:') ? listingId(item.url) : null;
      return id ? [id] : [];
    }))];
    const first = listingId(shown?.url);
    const queue = first ? [first, ...ids.filter((id) => id !== first)] : ids;
    let cancel = false;
    const pending = queue.filter((id) => !checked.current.has(id));
    if (pending.length === 0) return;
    const save = (id: string, row: LiveQuote) => {
      quotesRef.current = { ...quotesRef.current, [id]: row };
      publishLive(id, row);
      setQuotes(quotesRef.current);
    };
    (async () => {
      for (const id of pending) {
        if (cancel) return;
        checked.current.add(id);
        try {
          const data = await api<{ listing: { referenceEur: number | null; paintSeed: number | null; state?: string; floatValue?: number | null; image?: string | null; photos?: string[] } }>(`/api/market/csfloat/listings/${id}`);
          save(id, {
            referenceEur: data.listing.referenceEur,
            paintSeed: data.listing.paintSeed,
            state: data.listing.state || 'listed',
            floatValue: data.listing.floatValue ?? null,
            pictures: listingPictures(data.listing.photos, data.listing.image),
          });
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) save(id, { referenceEur: null, paintSeed: null, state: 'gone' });
          else checked.current.delete(id);
        }
        if (cancel) return;
      }
    })();
    return () => { cancel = true; };
  }, [candidateKey, shown?.url, visit]);

  if (!shown) return null;
  const { name, below } = offerName(shown.title);
  const watchId = shown.quoteKey?.match(/^listing:([a-f0-9]{24}):/)?.[1] || '';
  const ceiling = ceilings[watchId];
  const limit = ceiling != null ? ceiling.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : below;
  const when = saleMoment(shown);
  const price = shown.priceEur;
  const listing = listingId(shown.url);
  const known = quotes[listing || ''];
  const listed = listedFloat(shown.url, shown.quoteKey);
  const floatValue = shown.floatValue ?? known?.floatValue ?? listed?.floatValue ?? null;
  const pictures = [...new Set([...(known?.pictures || []), shown.image || '', skinArt(name) || '', skinArtSteam(name) || ''].filter(Boolean))];
  const picture = pictures[misses[shown.id] || 0] || null;
  const hash = hashes[watchId];
  const band = floatValue == null ? WEAR_BANDS.find((row) => row.wear === wearOfHash(hash)) ?? null : null;
  const reference = shown.referenceEur && shown.referenceEur > 0 ? shown.referenceEur : known?.referenceEur ?? (hash ? wearRefs[hash] ?? null : null);
  const premium = dealPct(price, reference);
  const pattern = shown.paintSeed ?? known?.paintSeed ?? listed?.paintSeed ?? null;

  return createPortal(
    <AnimatePresence>
      {open && (
          <motion.div
            className={cn(modalOverlayClass, 'z-[82]')}
            onPointerDown={(event) => { if (event.target === event.currentTarget) leave(); }}
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={still ? undefined : { opacity: 0, transition: quickOut }}
        >
          <motion.div
            key={shown.id}
            role="dialog"
            aria-labelledby="offer-notice-title"
            aria-roledescription="Mazo de ofertas"
            style={dragOn ? { x: dragX, y: dragY } : undefined}
            onPointerDown={grab}
            onPointerMove={pull}
            onPointerUp={drop}
            onPointerCancel={drop}
            className={cn(modalPanelClass, 'max-w-sm cursor-grab touch-none active:cursor-grabbing')}
            onClick={(event) => event.stopPropagation()}
            initial={still || dragOn ? false : nudge === 0 ? { opacity: 0, y: 28, scale: 0.96 } : { opacity: 1, x: Math.sign(nudge) * 48 }}
            animate={dragOn ? { opacity: 1, scale: 1 } : { opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={still ? undefined : { opacity: 0, transition: quickOut }}
            transition={still || dragOn ? { duration: 0 } : nudge === 0 ? { ...jelly, opacity: { duration: 0.18 } } : glide}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="offer-notice-title" className="min-w-0 text-[17px] font-black tracking-tight">{name}</h2>
              <span onPointerDown={(event) => event.stopPropagation()}><ModalClose onClose={leave} /></span>
            </div>
            <p className="mt-2 text-center text-[13px] font-black tabular-nums tracking-wide text-slate-400" aria-label={`Oferta ${place + 1} de ${deck.length}`}>{place + 1}/{deck.length}</p>
            {picture && (
              <div className="mt-3 grid place-items-center px-6 py-4">
                <img
                  key={picture}
                  src={picture}
                  alt=""
                  draggable={false}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  onError={() => setMisses((prev) => ({ ...prev, [shown.id]: (prev[shown.id] || 0) + 1 }))}
                  className="aspect-[4/3] max-h-56 w-full object-contain drop-shadow-[0_14px_18px_rgba(15,23,42,0.22)]"
                />
              </div>
            )}
            <div className="mt-4 flex items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <p className="text-[28px] font-black tabular-nums leading-none tracking-tight">{price == null ? '—' : formatEur(price)}</p>
                {premium != null && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-2 py-1 text-[12px] font-black tabular-nums text-white dark:bg-white dark:text-slate-950">
                    <span className={premium > 0 ? 'text-[#ff5a6a]' : premium < 0 ? 'text-[#3ddc97]' : ''}>{premium > 0 ? '+' : premium < 0 ? '−' : ''}</span>
                    {Math.abs(premium).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-slate-400">{formatDay(when)}</p>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-500">
              Alguien lo ha puesto a la venta{limit ? ` por debajo de ${limit}` : ''}.
            </p>
            {floatValue != null && (
              <div className="mt-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[15px] font-black tabular-nums">{floatValue.toFixed(5)}</p>
                  <p className="text-xs font-semibold text-slate-400">{wearOf(floatValue)}{pattern == null ? '' : ` · patrón ${pattern}`}</p>
                </div>
                <div className="relative mt-2 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500">
                  <span className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full bg-slate-900 ring-2 ring-white dark:bg-white dark:ring-slate-900" style={{ left: `${Math.min(100, Math.max(0, floatValue * 100))}%` }} />
                </div>
              </div>
            )}
            {band && (
              <div className="mt-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[15px] font-black tabular-nums">{floatText(band.from)} – {floatText(band.to)}</p>
                  <p className="text-xs font-semibold text-slate-400">{band.short}</p>
                </div>
                <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500">
                  <span className="absolute inset-y-0 left-0 bg-white/75 dark:bg-slate-900/75" style={{ width: `${band.from * 100}%` }} />
                  <span className="absolute inset-y-0 right-0 bg-white/75 dark:bg-slate-900/75" style={{ width: `${(1 - band.to) * 100}%` }} />
                </div>
              </div>
            )}
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={interest}
              disabled={!shown.url}
              className="mt-5 w-full rounded-full bg-slate-900 py-3 text-sm font-black text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
            >
              Me interesa
            </button>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={pass} className="mt-2 w-full py-2 text-sm font-bold text-slate-400">No me interesa</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
