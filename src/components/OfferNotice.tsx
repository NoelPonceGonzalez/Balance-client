import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ModalClose, modalOverlayClass, modalPanelClass } from '@/components/Modal';
import { api } from '@/lib/api';
import { formatDay, formatEur } from '@/lib/format';
import { quickOut, softSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/lib/types';

const SKIP = 'pat_offer_skip';
const PASSED = 'pat_offer_passed';
const ASIDE = 'pat_offer_aside';

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

function offerToken(item: AppNotification): string {
  const listing = listingOf(item.quoteKey);
  const price = item.priceEur == null ? '' : Math.round(item.priceEur);
  return listing ? `${listing}:${price}` : item.id;
}

function dismissed(item: AppNotification, skip: Set<string>, passed: PassedOffer[]): boolean {
  if (skip.has(item.id)) return true;
  const listing = listingOf(item.quoteKey);
  const price = item.priceEur;
  if (!listing || price == null) return false;
  return passed.some((row) => row.listing === listing && Math.abs(row.price - price) < 1);
}

function readAside(): Set<string> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(ASIDE) || '[]') as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function rememberAside(token: string) {
  const next = readAside();
  next.add(token);
  sessionStorage.setItem(ASIDE, JSON.stringify([...next].slice(-200)));
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

export function OfferNotice() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [skip, setSkip] = useState<Set<string>>(() => skippedIds());
  const [passed, setPassed] = useState<PassedOffer[]>(() => readPassed());
  const [aside, setAside] = useState<Set<string>>(() => readAside());
  const [visit, setVisit] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<{ notifications: AppNotification[] }>('/api/market/notifications')
      .then((data) => {
        if (!cancelled) setItems(data.notifications || []);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [visit]);

  useEffect(() => {
    let away = false;
    const onHide = () => {
      if (document.visibilityState === 'hidden') away = true;
      if (document.visibilityState === 'visible' && away) {
        away = false;
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
    const token = offerToken(item);
    if (buckets.has(token)) continue;
    buckets.add(token);
    unique.push(item);
  }
  const current = unique.find((item) => !dismissed(item, skip, passed) && !aside.has(offerToken(item)));
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const open = Boolean(current);

  const leave = () => {
    for (const item of unique) {
      if (!dismissed(item, skip, passed)) rememberAside(offerToken(item));
    }
    setAside(readAside());
  };
  const pass = () => {
    if (!current) return;
    const id = current.id;
    rememberPassed(current);
    setSkip(skippedIds());
    setPassed(readPassed());
    void api(`/api/market/notifications/${id}/pass`, { method: 'POST' }).catch(() => undefined);
  };
  const openLink = () => {
    if (!current?.url) return;
    window.open(current.url, '_blank', 'noopener,noreferrer');
    leave();
  };

  if (!current) return null;
  const { name, below } = offerName(current.title);
  const when = saleMoment(current);
  const price = current.priceEur;
  const floatValue = current.floatValue;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(modalOverlayClass, 'z-[82]')}
          onClick={leave}
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={still ? undefined : { opacity: 0, transition: quickOut }}
        >
          <motion.div
            key={current.id}
            role="dialog"
            aria-labelledby="offer-notice-title"
            className={cn(modalPanelClass, 'max-w-sm')}
            onClick={(event) => event.stopPropagation()}
            initial={still ? false : { opacity: 0, scaleX: 0.86, scaleY: 0.8, y: 28 }}
            animate={{ opacity: 1, scaleX: 1, scaleY: 1, y: 0 }}
            exit={still ? undefined : { opacity: 0, scale: 0.94, y: 16, transition: quickOut }}
            transition={{ ...softSpring, opacity: { duration: 0.18 } }}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="offer-notice-title" className="min-w-0 text-[17px] font-black tracking-tight">{name}</h2>
              <ModalClose onClose={leave} />
            </div>
            {current.image && (
              <div className="mt-4 grid place-items-center">
                <img src={current.image} alt="" referrerPolicy="no-referrer" className="h-40 w-56 object-contain" />
              </div>
            )}
            <div className="mt-4 flex items-end justify-between gap-3">
              <p className="text-[28px] font-black tabular-nums leading-none tracking-tight">{price == null ? '—' : formatEur(price)}</p>
              <p className="text-sm font-medium text-slate-400">{formatDay(when)}</p>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-500">
              Alguien lo ha puesto a la venta{below ? ` por debajo de ${below}` : ''}.
            </p>
            {floatValue != null && (
              <p className="mt-1 text-xs font-medium text-slate-400">Float {floatValue.toFixed(4)} · {wearOf(floatValue)}</p>
            )}
            <button
              type="button"
              onClick={openLink}
              disabled={!current.url}
              className="mt-5 w-full rounded-full bg-slate-900 py-3 text-sm font-black text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
            >
              {current.url?.includes('skinport.com') ? 'Ir a Skinport' : 'Ir a la oferta'}
            </button>
            <button type="button" onClick={pass} className="mt-2 w-full py-2 text-sm font-bold text-slate-400">No me interesa</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
