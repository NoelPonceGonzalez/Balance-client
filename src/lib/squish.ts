const PRESSABLE = 'button:not(:disabled), a[href], [role="button"], .hold-target, summary';

/**
 * Aplasta lo que se pulsa y lo suelta con un rebote de gelatina.
 * Usa la propiedad `scale`, así no pisa los `transform` que pone Motion.
 */
export function installSquish(): void {
  if (typeof window === 'undefined' || (window as { __squish?: boolean }).__squish) return;
  (window as { __squish?: boolean }).__squish = true;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let timer = 0;

  const release = (bounce: boolean) => {
    window.clearTimeout(timer);
    const el = current;
    current = null;
    if (!el) return;
    const pressed = el.classList.contains('is-pressed');
    const held = el.dataset.held === '1';
    delete el.dataset.held;
    el.classList.remove('is-pressed');
    if (!bounce || !pressed || held || el.classList.contains('hold-pop')) return;
    el.classList.remove('is-jelly', 'plan-rise');
    void el.offsetWidth;
    el.classList.add('is-jelly');
    const done = () => el.classList.remove('is-jelly');
    el.addEventListener('animationend', done, { once: true });
    window.setTimeout(done, 900);
  };

  document.addEventListener('pointerdown', (event) => {
    if (reduce.matches || event.button !== 0) return;
    const el = (event.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
    if (!el || el.closest('[data-no-squish]')) return;
    release(false);
    current = el;
    startX = event.clientX;
    startY = event.clientY;
    el.classList.add('squishy');
    el.classList.toggle('squish-big', el.offsetHeight > 88 || el.offsetWidth > 280);
    timer = window.setTimeout(() => {
      if (current === el) el.classList.add('is-pressed');
    }, event.pointerType === 'mouse' ? 0 : 45);
  }, { capture: true, passive: true });

  document.addEventListener('pointermove', (event) => {
    if (current && Math.hypot(event.clientX - startX, event.clientY - startY) > 8) release(false);
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', () => release(true), { capture: true });
  document.addEventListener('pointercancel', () => release(false), { capture: true });
  document.addEventListener('scroll', () => release(false), { capture: true, passive: true });
}
