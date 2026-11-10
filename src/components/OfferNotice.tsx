import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, type AnimationPlaybackControls } from 'motion/react';
import { ModalClose, modalOverlayClass, modalPanelClass } from '@/components/Modal';
import { api, ApiError } from '@/lib/api';
import { formatDay, formatEur } from '@/lib/format';
import { quickOut, softSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/lib/types';

const SKIP = 'pat_offer_skip';
const PASSED = 'pat_offer_passed';

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
    .sort((a, b) => (a.priceEur ?? Number.POSITIVE_INFINITY) - (b.priceEur ?? Number.POSITIVE_INFINITY) || a.createdAt.localeCompare(b.createdAt));
}

export function nextOffer(items: AppNotification[]): AppNotification | null {
  return rankedOffers(items)[0] || null;
}

function listingId(url: string | null | undefined): string | null {
  return url?.match(/csfloat\.com\/item\/(\d+)/)?.[1] ?? null;
}

type LiveQuote = { referenceEur: number | null; paintSeed: number | null; state: string };

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

function wearOf(floatValue: number): string {
  if (floatValue < 0.07) return 'Recién fabricada';
  if (floatValue < 0.15) return 'Casi nueva';
  if (floatValue < 0.38) return 'Algo desgastada';
  if (floatValue < 0.45) return 'Bastante desgastada';
  return 'Veterana de guerra';
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
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragAxis = useRef<'x' | 'y' | null>(null);
  const flying = useRef<AnimationPlaybackControls | null>(null);
  const deckReady = useRef('');
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ notifications: AppNotification[] }>('/api/market/notifications')
      .then((data) => {
        if (!cancelled) setItems(data.notifications || []);
      })
      .catch(() => undefined);
    const refreshCeilings = () => {
      api<{ purchases?: { id: string; belowEur: number }[] }>('/api/market')
        .then((data) => {
          if (cancelled) return;
          const next: Record<string, number> = {};
          for (const row of data.purchases || []) {
            if (row.id && row.belowEur > 0) next[row.id] = row.belowEur;
          }
          setCeilings(next);
        })
        .catch(() => undefined);
    };
    refreshCeilings();
    window.addEventListener('pat-alerts', refreshCeilings);
    return () => {
      cancelled = true;
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
  if (picked && listingStillUp(picked.url) && !unique.some((item) => item.id === picked.id)) unique.unshift(picked);
  const deckKey = unique.map((item) => item.id).join('|');
  const focusId = picked?.id || '';
  const place = unique.length === 0 ? 0 : Math.min(index, unique.length - 1);
  const shown = unique[place] || null;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const open = Boolean(shown) && Boolean(picked);

  useEffect(() => {
    if (focusId) {
      const at = unique.findIndex((item) => item.id === focusId);
      if (at >= 0) setIndex(at);
      return;
    }
    const token = `${visit}:${deckKey}`;
    if (!deckKey || deckReady.current === token) return;
    const at = unique.findIndex((item) => !dismissed(item, skip, passed));
    if (at < 0) return;
    deckReady.current = token;
    setIndex(at);
  }, [visit, deckKey, focusId]);

  const leave = () => {
    if (picked) onFocusedClose?.();
    setAside(true);
  };
  const settle = { type: 'spring' as const, stiffness: 420, damping: 38, mass: 0.7 };
  const stopFlight = () => {
    const run = flying.current;
    flying.current = null;
    run?.stop();
  };
  const grab = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    stopFlight();
    setDragId(shown?.id || null);
    dragOrigin.current = { x: event.clientX, y: event.clientY };
    dragAxis.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pull = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (!dragAxis.current && Math.hypot(dx, dy) > 8) dragAxis.current = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    if (dragAxis.current === 'y') dragY.set(Math.max(0, dy));
    else if (dragAxis.current === 'x') dragX.set(dx);
  };
  const drop = () => {
    if (!dragOrigin.current) return;
    const dx = dragX.get();
    const dy = dragY.get();
    const axis = dragAxis.current;
    dragOrigin.current = null;
    dragAxis.current = null;
    if (axis === 'y') {
      if (dy > 88) leave();
      else void animate(dragY, 0, settle);
      return;
    }
    const travel = Math.min(window.innerWidth, 560);
    const glideOff = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number] };
    if (dx <= -72) {
      const run = animate(dragX, -travel, glideOff);
      flying.current = run;
      void run.finished.then(() => { if (flying.current === run) turn(1); }).catch(() => undefined);
    } else if (dx >= 72) {
      const run = animate(dragX, travel, glideOff);
      flying.current = run;
      void run.finished.then(() => { if (flying.current === run) turn(-1); }).catch(() => undefined);
    } else {
      flying.current = animate(dragX, 0, settle);
    }
  };
  const turn = (step: number) => {
    flying.current = null;
    dragX.set(0);
    dragY.set(0);
    setDragId(null);
    if (unique.length < 2) return;
    const next = (place + step + unique.length) % unique.length;
    setNudge(step);
    setIndex(next);
  };
  const pass = () => {
    if (!shown) return;
    const id = shown.id;
    rememberPassed(shown);
    const nextSkip = skippedIds();
    const nextPassed = readPassed();
    setSkip(nextSkip);
    setPassed(nextPassed);
    const later = unique.findIndex((item, at) => at > place && !dismissed(item, nextSkip, nextPassed));
    const earlier = unique.findIndex((item) => !dismissed(item, nextSkip, nextPassed));
    if (later >= 0) turn(later - place);
    else if (earlier >= 0) {
      setNudge(-1);
      setIndex(earlier);
    } else leave();
    void api(`/api/market/notifications/${id}/pass`, { method: 'POST' }).catch(() => undefined);
  };
  const interest = () => {
    if (!shown?.url) return;
    const id = shown.id;
    const url = shown.url;
    window.open(url, '_blank', 'noopener,noreferrer');
    void api(`/api/market/notifications/${id}/keep`, { method: 'POST' }).catch(() => undefined);
    if (picked) onFocusedClose?.();
    setAside(true);
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
          const data = await api<{ listing: { referenceEur: number | null; paintSeed: number | null; state?: string } }>(`/api/market/csfloat/listings/${id}`);
          save(id, {
            referenceEur: data.listing.referenceEur,
            paintSeed: data.listing.paintSeed,
            state: data.listing.state || 'listed',
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
  const floatValue = shown.floatValue;
  const listing = listingId(shown.url);
  const known = quotes[listing || ''];
  const reference = shown.referenceEur && shown.referenceEur > 0 ? shown.referenceEur : known?.referenceEur ?? null;
  const premium = dealPct(price, reference);
  const pattern = shown.paintSeed ?? known?.paintSeed ?? null;

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
            style={{ x: dragId === shown.id ? dragX : 0, y: dragId === shown.id ? dragY : 0 }}
            onPointerDown={grab}
            onPointerMove={pull}
            onPointerUp={drop}
            onPointerCancel={drop}
            className={cn(modalPanelClass, 'max-w-sm cursor-grab touch-none active:cursor-grabbing')}
            onClick={(event) => event.stopPropagation()}
            initial={still ? false : { opacity: 0, scale: nudge === 0 ? 0.96 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={still ? undefined : { opacity: 0, scale: 0.94, y: 16, transition: quickOut }}
            transition={{ ...softSpring, opacity: { duration: 0.18 } }}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="offer-notice-title" className="min-w-0 text-[17px] font-black tracking-tight">{name}</h2>
              <span onPointerDown={(event) => event.stopPropagation()}><ModalClose onClose={leave} /></span>
            </div>
            <p className="mt-2 text-center text-[13px] font-black tabular-nums tracking-wide text-slate-400" aria-label={`Oferta ${place + 1} de ${unique.length}`}>{place + 1}/{unique.length}</p>
            {shown.image && (
              <div className="relative mt-3 grid place-items-center">
                <img src={shown.image} alt="" draggable={false} referrerPolicy="no-referrer" className="h-36 w-52 object-contain" />
                {premium != null && (
                  <span className={cn('absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-slate-950/90 px-2 py-1 text-[12px] font-black tabular-nums text-white')}>
                    <span className={premium > 0 ? 'text-[#ff5a6a]' : premium < 0 ? 'text-[#3ddc97]' : 'text-white'}>{premium > 0 ? '+' : premium < 0 ? '−' : ''}</span>
                    {Math.abs(premium).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                  </span>
                )}
              </div>
            )}
            <div className="mt-4 flex items-end justify-between gap-3">
              <p className="text-[28px] font-black tabular-nums leading-none tracking-tight">{price == null ? '—' : formatEur(price)}</p>
              {!shown.image && premium != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-2 py-1 text-[12px] font-black tabular-nums text-white">
                  <span className={premium > 0 ? 'text-[#ff5a6a]' : 'text-[#3ddc97]'}>{premium > 0 ? '+' : '−'}</span>
                  {Math.abs(premium).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                </span>
              )}
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
