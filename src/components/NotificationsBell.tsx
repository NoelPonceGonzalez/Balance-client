import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { formatAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/lib/types';

export function NotificationsBell({ align = 'left', onDue, onPlan }: { align?: 'left' | 'right'; onDue?: (quoteKey: string) => void; onPlan?: (planId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>(typeof Notification === 'undefined' ? 'denied' : Notification.permission);
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

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const left = align === 'right' ? Math.max(12, rect.right - width) : Math.min(rect.right + 12, window.innerWidth - width - 12);
      const top = align === 'right' ? rect.bottom + 8 : rect.top;
      setSpot({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, align]);

  const unread = items.filter((item) => !item.read).length;

  const markRead = async () => {
    await api('/api/market/notifications/read', { method: 'POST', body: '{}' });
    setItems((current) => current.map((item) => ({ ...item, read: true })));
  };

  const enableBrowser = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const panel = open && spot ? (
    <div className="fixed z-[70] w-[min(20rem,calc(100vw-1.5rem))] rounded-3xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-800 dark:bg-slate-950" style={{ top: spot.top, left: spot.left }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-black">Avisos</p>
        {unread > 0 && <button type="button" onClick={() => void markRead()} className="text-xs font-bold text-indigo-600">Marcar leídos</button>}
      </div>
      {permission !== 'granted' && (
        <button type="button" onClick={() => void enableBrowser()} className="mb-2 w-full rounded-2xl bg-slate-100 px-3 py-2 text-left text-xs font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          Activar avisos del sistema
        </button>
      )}
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {items.length === 0 && <p className="px-1 py-3 text-sm font-medium text-slate-500">Aquí salen los pagos y los ingresos que tocan, si una inversión cruza el umbral, y si alguien se sale de un reparto.</p>}
        {items.map((item) => {
          const planId = item.quoteKey?.startsWith('reparto:')
            ? item.quoteKey.slice('reparto:'.length)
            : item.quoteKey?.startsWith('trip-remind:')
              ? item.quoteKey.split(':')[1] || ''
              : '';
          const openDue = item.direction === 'due' && item.quoteKey?.startsWith('plan-due:') && onDue;
          const body = (
            <>
              <p className={cn('text-sm font-black', item.direction === 'up' ? 'text-[#16c784]' : item.direction === 'due' ? 'text-slate-800 dark:text-white' : 'text-[#ea3943]')}>{item.title}</p>
              <p className="text-xs font-medium text-slate-500">{item.body}</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">{formatAgo(item.createdAt)}</p>
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
          return (
            <article key={item.id} className={cn('rounded-2xl px-3 py-2', item.read ? 'bg-transparent' : 'bg-slate-50 dark:bg-slate-900')}>
              {body}
            </article>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative">
      <button ref={buttonRef} type="button" onClick={() => setOpen((value) => !value)} className="relative rounded-2xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Avisos">
        <Bell size={18} />
        {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ea3943] px-1 text-[10px] font-black text-white">{unread}</span>}
      </button>
      {panel && createPortal(panel, document.body)}
    </div>
  );
}
