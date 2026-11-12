import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { activatePush } from '@/lib/device';
import { formatAgo } from '@/lib/format';
import { skinArt, skinArtSteam } from '@/lib/skin-art';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/lib/types';

function OfferThumb({ item }: { item: AppNotification }) {
  const sources = [...new Set([item.image || '', skinArt(item.title) || '', skinArtSteam(item.title) || ''].filter(Boolean))];
  const [miss, setMiss] = useState(0);
  const src = sources[miss];
  if (!src) return null;
  return <img key={src} src={src} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => setMiss((value) => value + 1)} className="h-10 w-14 shrink-0 object-contain" />;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function prefersStill() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function noticeKind(item: AppNotification): string {
  const key = item.quoteKey || '';
  if (key.startsWith('skin:')) return 'Skin';
  if (key.startsWith('tracked:')) return 'Anuncio';
  if (key.startsWith('plan-due:') || key.startsWith('plan-auto:') || key.startsWith('plan-inv:')) return 'Plan';
  if (key.startsWith('listing:')) return 'Oferta';
  if (key.startsWith('reparto:') || key.startsWith('trip-remind:')) return 'Reparto';
  if (item.direction === 'due') return 'Plan';
  return 'Mercado';
}

export function NotificationsBell({ align = 'left', onDue, onPlan, onOffer, onListing }: { align?: 'left' | 'right'; onDue?: (quoteKey: string) => void; onPlan?: (planId: string) => void; onOffer?: (item: AppNotification) => void; onListing?: (listingId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>(typeof Notification === 'undefined' ? 'denied' : Notification.permission);
  const [phone, setPhone] = useState('');
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  const announced = useRef<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await api<{ notifications: AppNotification[] }>('/api/market/notifications');
        if (cancelled) return;
        const newest = data.notifications.reduce((max, item) => Math.max(max, new Date(item.createdAt).getTime()), 0);
        if (announced.current == null) {
          announced.current = newest;
        } else if (permission === 'granted') {
          for (const item of data.notifications) {
            const at = new Date(item.createdAt).getTime();
            if (at > announced.current) new Notification(item.title, { body: item.body });
          }
          announced.current = Math.max(announced.current, newest);
        } else {
          announced.current = Math.max(announced.current, newest);
        }
        setItems(data.notifications);
      } catch {
        // El siguiente ciclo vuelve a pedirlo.
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [permission, open]);

  const place = () => {
    const button = buttonRef.current;
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const left = align === 'right' ? Math.max(12, rect.right - width) : Math.min(rect.right + 12, window.innerWidth - width - 12);
    const top = align === 'right' ? rect.bottom + 8 : rect.top;
    return { top, left };
  };

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const next = place();
      if (next) setSpot(next);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, align]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const next = place();
    if (!next) return;
    setSpot(next);
    setOpen(true);
  };

  const unread = items.filter((item) => !item.read).length;

  const markRead = async () => {
    await api('/api/market/notifications/read', { method: 'POST', body: '{}' });
    setItems((current) => current.map((item) => ({ ...item, read: true })));
  };

  const enableBrowser = async () => {
    const message = await activatePush().catch((err: Error) => err.message);
    setPermission(typeof Notification === 'undefined' ? 'denied' : Notification.permission);
    setPhone(message);
  };

  const still = prefersStill();
  const fromBell = align === 'right' ? -8 : 8;
  const panel = (
    <AnimatePresence>
    {open && spot && (
    <motion.button
      key="avisos-fondo"
      type="button"
      className="fixed inset-0 z-[65] cursor-default"
      aria-label="Cerrar avisos"
      onClick={() => setOpen(false)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: still ? 0 : 0.2 }}
    />
    )}
    {open && spot && (
    <motion.div
      key="avisos"
      className="fixed z-[70] w-[min(20rem,calc(100vw-1.5rem))] rounded-3xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
      style={{ top: spot.top, left: spot.left, transformOrigin: align === 'right' ? 'top right' : 'top left' }}
      initial={still ? false : { opacity: 0, y: fromBell, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={still ? { opacity: 0 } : { opacity: 0, y: fromBell / 2, scale: 0.98, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } }}
      transition={still ? { duration: 0 } : { duration: 0.34, ease: EASE_OUT }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-black">Avisos</p>
        {unread > 0 && <button type="button" onClick={() => void markRead()} className="text-xs font-semibold text-slate-900 dark:text-white">Marcar leídos</button>}
      </div>
      {permission !== 'granted' && (
        <button type="button" onClick={() => void enableBrowser()} className="mb-2 w-full rounded-2xl bg-slate-100 px-3 py-2 text-left text-xs font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          Activar avisos en el móvil
        </button>
      )}
      {phone && <p className="mb-2 px-1 text-xs font-medium text-slate-500">{phone}</p>}
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {items.length === 0 && <p className="px-1 py-3 text-sm font-medium text-slate-500">Cada aviso es de una cosa distinta: un plan, un precio, una skin destacada, un anuncio o una oferta.</p>}
        {items.map((item) => {
          const kind = noticeKind(item);
          const planId = item.quoteKey?.startsWith('reparto:')
            ? item.quoteKey.slice('reparto:'.length)
            : item.quoteKey?.startsWith('trip-remind:')
              ? item.quoteKey.split(':')[1] || ''
              : '';
          const openDue = item.direction === 'due' && item.quoteKey?.startsWith('plan-due:') && onDue;
          const body = (
            <>
              <p className="text-[11px] font-semibold text-slate-400">{kind}</p>
              <p className={cn('text-sm font-semibold', kind === 'Mercado' ? (item.direction === 'up' ? 'text-[#16c784]' : 'text-[#ea3943]') : 'text-slate-900 dark:text-white')}>{item.title}</p>
              <p className="text-xs font-medium text-slate-500">{item.body}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-400">{formatAgo(item.createdAt)}</p>
            </>
          );
          if (planId && onPlan) {
            return (
              <button key={item.id} type="button" onClick={() => { setOpen(false); onPlan(planId); }} className={cn('block w-full rounded-2xl px-3 py-2 text-left', item.read ? 'bg-transparent' : 'bg-slate-50 dark:bg-slate-900')}>
                {body}
              </button>
            );
          }
          if (openDue) {
            return (
              <button key={item.id} type="button" onClick={() => { setOpen(false); onDue(item.quoteKey as string); }} className={cn('block w-full rounded-2xl px-3 py-2 text-left', item.read ? 'bg-transparent' : 'bg-slate-50 dark:bg-slate-900')}>
                {body}
              </button>
            );
          }
          if (item.quoteKey?.startsWith('skin:')) {
            return (
              <article key={item.id} className={cn('flex items-center gap-3 rounded-2xl px-3 py-2', item.read ? 'bg-transparent' : 'bg-slate-50 dark:bg-slate-900')}>
                {item.image && <img src={item.image} alt="" referrerPolicy="no-referrer" className="h-10 w-14 shrink-0 object-contain" />}
                <span className="min-w-0">{body}</span>
              </article>
            );
          }
          const trackedId = item.quoteKey?.startsWith('tracked:') ? item.quoteKey.split(':')[1] || '' : '';
          if (trackedId && onListing) {
            return (
              <button key={item.id} type="button" onClick={() => { setOpen(false); onListing(trackedId); }} className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left', item.read ? 'bg-transparent' : 'bg-slate-50 dark:bg-slate-900')}>
                {item.image && <img src={item.image} alt="" referrerPolicy="no-referrer" className="h-10 w-14 shrink-0 object-contain" />}
                <span className="min-w-0">{body}</span>
              </button>
            );
          }
          if (item.quoteKey?.startsWith('listing:') && onOffer) {
            return (
              <button key={item.id} type="button" onClick={() => { setOpen(false); onOffer(item); }} className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left', item.read ? 'bg-transparent' : 'bg-slate-50 dark:bg-slate-900')}>
                <OfferThumb item={item} />
                <span className="min-w-0">{body}</span>
              </button>
            );
          }
          return (
            <article key={item.id} className={cn('rounded-2xl px-3 py-2', item.read ? 'bg-transparent' : 'bg-slate-50 dark:bg-slate-900')}>
              {body}
            </article>
          );
        })}
      </div>
    </motion.div>
    )}
    </AnimatePresence>
  );

  return (
    <div className="relative">
      <button ref={buttonRef} type="button" onClick={toggle} className="relative rounded-2xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Avisos" aria-expanded={open}>
        <Bell size={18} />
        {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ea3943] px-1 text-[10px] font-black text-white">{unread}</span>}
      </button>
      {createPortal(panel, document.body)}
    </div>
  );
}
