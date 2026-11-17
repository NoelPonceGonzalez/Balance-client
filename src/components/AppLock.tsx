import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronRight, Fingerprint } from 'lucide-react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/browser';
import { api, keepGate } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';
import { Mark } from '@/components/Mark';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'borrar'] as const;

type Step = 'pin' | 'fresh' | 'repeat' | 'password';

function remember(gate: string) {
  keepGate(gate);
}

export function AppLock({
  mode,
  onOpen,
  onUser,
  onCancel,
}: {
  mode: 'open' | 'create' | 'change';
  onOpen: () => void;
  onUser?: (user: User) => void;
  onCancel?: () => void;
}) {
  const [forgot, setForgot] = useState(false);
  const [step, setStep] = useState<Step>(mode === 'create' ? 'fresh' : 'pin');
  const [digits, setDigits] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [passed, setPassed] = useState(false);
  const [bio, setBio] = useState(false);

  const digitsRef = useRef('');
  const stepRef = useRef<Step>(mode === 'create' ? 'fresh' : 'pin');
  const freshRef = useRef('');
  const currentRef = useRef('');
  const forgotRef = useRef(false);
  const busyRef = useRef(false);
  const passedRef = useRef(false);
  const bioRef = useRef(false);
  const hasPasskeyRef = useRef(false);
  const openTimer = useRef(0);
  const handledAt = useRef(0);
  const pushRef = useRef<(key: string) => void>(() => undefined);

  useEffect(() => () => window.clearTimeout(openTimer.current), []);

  useEffect(() => {
    const platform = window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable;
    if (!platform) return;
    void platform.call(window.PublicKeyCredential).then((ok) => {
      bioRef.current = ok;
      setBio(ok);
    }).catch(() => undefined);
    void api<{ user: User }>('/api/auth/me').then((data) => {
      hasPasskeyRef.current = Boolean(data.user.passkey);
    }).catch(() => undefined);
  }, []);

  const offerPasskey = async () => {
    if (!bioRef.current || hasPasskeyRef.current) return;
    try {
      const options = await api<PublicKeyCredentialCreationOptionsJSON>('/api/auth/passkey/register/options', { method: 'POST' });
      const credential = await startRegistration({ optionsJSON: options });
      const saved = await api<{ user: User }>('/api/auth/passkey/register', { method: 'POST', body: JSON.stringify(credential satisfies RegistrationResponseJSON) });
      hasPasskeyRef.current = true;
      onUser?.(saved.user);
    } catch {
      // Si cancelan la huella, el código ya está aceptado.
    }
  };

  const usePasskey = async () => {
    if (busyRef.current || passedRef.current) return;
    if (!hasPasskeyRef.current) {
      setError('Entra con el código. Luego este teléfono guarda la huella.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const options = await api<PublicKeyCredentialRequestOptionsJSON>('/api/auth/passkey/options', { method: 'POST' });
      const credential = await startAuthentication({ optionsJSON: options });
      const data = await api<{ gate: string }>('/api/auth/passkey/open', {
        method: 'POST',
        body: JSON.stringify(credential satisfies AuthenticationResponseJSON),
      });
      remember(data.gate);
      reveal();
    } catch (err) {
      const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: string }).name) : '';
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'No se ha podido usar la huella.');
      }
    } finally {
      if (!passedRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const reveal = () => {
    passedRef.current = true;
    setPassed(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => onOpen(), reduce ? 220 : 1080);
  };

  const writeDigits = (value: string) => {
    digitsRef.current = value;
    setDigits(value);
  };

  const writeStep = (value: Step) => {
    stepRef.current = value;
    setStep(value);
  };

  const title = step === 'password' ? 'Tu contraseña' : step === 'repeat' ? 'Repite el código' : step === 'fresh' ? 'Elige un código' : 'Código';
  const hint = step === 'password'
    ? 'Con la contraseña queda el código nuevo.'
    : step === 'repeat'
      ? 'Los mismos 4 números.'
      : step === 'pin' && mode === 'open' && !forgot
        ? 'Hace falta para ver el dinero.'
        : mode === 'create'
          ? 'Te quedas aquí hasta guardarlo. Luego, al volver, solo se piden estos 4 números.'
          : 'Cuatro números. Se piden otra vez al salir.';

  const finish = async (pin: string, previous: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (mode === 'open' && !forgotRef.current) {
        const data = await api<{ gate: string }>('/api/auth/lock/open', { method: 'POST', body: JSON.stringify({ pin }) });
        remember(data.gate);
        await offerPasskey();
        reveal();
        return;
      }
      if (forgotRef.current) {
        const data = await api<{ user: User; gate: string }>('/api/auth/lock/reset', {
          method: 'POST',
          body: JSON.stringify({ password, pin }),
        });
        remember(data.gate);
        onUser?.(data.user);
        await offerPasskey();
        reveal();
        return;
      }
      const data = await api<{ user: User; gate: string }>('/api/auth/lock', {
        method: 'POST',
        body: JSON.stringify(mode === 'create' ? { pin } : { pin, current: previous }),
      });
      remember(data.gate);
      onUser?.(data.user);
      await offerPasskey();
      reveal();
    } catch (err) {
      writeDigits('');
      setShake((value) => value + 1);
      setError(err instanceof Error ? err.message : 'No se ha podido abrir.');
    } finally {
      if (!passedRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const push = (key: string) => {
    if (busyRef.current || passedRef.current || stepRef.current === 'password') return;
    setError('');
    if (key === 'borrar') {
      writeDigits(digitsRef.current.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key) || digitsRef.current.length >= 4) return;
    const next = `${digitsRef.current}${key}`;
    writeDigits(next);
    if (next.length < 4) return;
    const now = stepRef.current;
    if (now === 'pin') {
      if (mode === 'open' && !forgotRef.current) {
        void finish(next, '');
        return;
      }
      currentRef.current = next;
      writeDigits('');
      writeStep('fresh');
      return;
    }
    if (now === 'fresh') {
      freshRef.current = next;
      writeDigits('');
      writeStep('repeat');
      return;
    }
    if (next !== freshRef.current) {
      freshRef.current = '';
      writeDigits('');
      writeStep('fresh');
      setShake((value) => value + 1);
      setError('Los códigos no coinciden. Elige otro.');
      return;
    }
    if (forgotRef.current) {
      writeDigits('');
      writeStep('password');
      return;
    }
    void finish(next, currentRef.current);
  };

  pushRef.current = push;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (stepRef.current === 'password') return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        pushRef.current(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        pushRef.current('borrar');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tap = (key: string, source: 'pointer' | 'click') => {
    const now = performance.now();
    if (source === 'click' && now - handledAt.current < 500) return;
    if (source === 'pointer') handledAt.current = now;
    push(key);
  };

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const screen = (
    <div data-lock-root className="fixed inset-0 z-[80] flex min-h-dvh flex-col overflow-hidden bg-[#f6f3ee] px-7 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(3.25rem,env(safe-area-inset-top))] text-[#1c1915] dark:bg-[#0c0b0a] dark:text-[#f6f1e8]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgba(255,252,246,0.95),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(232,214,180,0.16),transparent_62%)]" />
      <div className={cn('relative flex min-h-0 flex-1 flex-col', passed && '[&_.lock-pad]:opacity-30')}>
        <motion.div layout className="flex items-center gap-3">
          <motion.div
            layout
            className="grid h-12 w-12 shrink-0 place-items-center rounded-[1.15rem] bg-[#1c1915] text-[#f6f1e8] shadow-[0_12px_28px_rgba(28,25,21,0.16)] dark:bg-[#f4efe6] dark:text-[#16140f] dark:shadow-[0_16px_36px_rgba(0,0,0,0.4)]"
            animate={passed ? { scale: 1.04 } : { scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 18 }}
          >
            <Mark size={22} />
          </motion.div>
          <AnimatePresence>
            {passed && (
              <motion.div
                key="lock-open"
                className="relative shrink-0 overflow-visible text-[#1c1915] dark:text-[#e6d3ae]"
                initial={reduceMotion ? { opacity: 1, scale: 1, width: 40, marginLeft: 14 } : { opacity: 0, scale: 0.5, width: 0, marginLeft: 0 }}
                animate={{ opacity: 1, scale: 1, width: 40, marginLeft: 14 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 24 }}
                aria-hidden
              >
                <span className="absolute inset-0 -z-10 rounded-full bg-[#1c1915]/10 blur-md dark:bg-[#e6d3ae]/30" />
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <motion.circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    initial={{ pathLength: reduceMotion ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.48, ease: 'easeOut' }}
                  />
                  <motion.path
                    d="M12.6 20.4 17.4 25.1 27.2 14.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: reduceMotion ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.32, delay: reduceMotion ? 0 : 0.34, ease: 'easeOut' }}
                  />
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#8a8175] dark:text-[#a89880]">Balance</p>
        </motion.div>
        <h1 className="mt-8 text-left text-[2.05rem] font-semibold leading-none tracking-tight">{title}</h1>
        <p className="mt-3 max-w-[18rem] text-left text-[15px] leading-6 text-[#8a8175] dark:text-[#9c9184]">{hint}</p>
        <div className="lock-pad flex min-h-0 flex-1 flex-col transition-opacity duration-500">
          <div className="flex flex-1 flex-col items-center justify-center py-8">
            {step !== 'password' && (
              <div key={shake} className={cn('flex justify-center gap-5', shake > 0 && error && 'lock-shake')} aria-live="polite" aria-label={`${digits.length} de 4`}>
                {Array.from({ length: 4 }, (_, index) => (
                  <span
                    key={index}
                    className={cn(
                      'h-3 w-3 rounded-full transition-all duration-150',
                      index < digits.length ? 'scale-100 bg-[#1c1915] dark:bg-[#f4efe6] dark:shadow-[0_0_12px_rgba(244,239,230,0.45)]' : 'scale-90 bg-[#d9d1c5] dark:bg-[#3a342c]',
                    )}
                  />
                ))}
              </div>
            )}
            {mode === 'open' && !forgot && !passed && step !== 'password' && (
              <button
                type="button"
                onClick={() => {
                  forgotRef.current = true;
                  setForgot(true);
                  setError('');
                  freshRef.current = '';
                  currentRef.current = '';
                  writeDigits('');
                  writeStep('fresh');
                }}
                className="mt-7 inline-flex items-center gap-1 text-[15px] text-[#8a8175] dark:text-[#9c9184]"
              >
                He olvidado el código
                <ChevronRight size={16} />
              </button>
            )}
            {error && <p className="mt-5 text-center text-sm font-medium text-rose-600">{error}</p>}
          </div>
          {step === 'password' ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (passedRef.current || password.trim().length < 8 || freshRef.current.length !== 4) return;
                void finish(freshRef.current, '');
              }}
            >
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Contraseña"
                aria-label="Contraseña"
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-base text-[#1c1915] outline-none placeholder:text-[#b3aa9e] focus:border-[#1c1915] dark:border-white/10 dark:bg-[#171512] dark:text-[#f6f1e8] dark:placeholder:text-[#6f675c] dark:focus:border-[#e6d3ae]/50"
              />
              <button
                type="submit"
                disabled={busy || password.trim().length < 8}
                className="w-full rounded-full bg-[#1c1915] py-3.5 text-sm font-semibold tracking-wide text-[#f6f1e8] disabled:opacity-40 dark:bg-[#f4efe6] dark:text-[#16140f]"
              >
                Guardar código
              </button>
            </form>
          ) : (
            <div className="grid grid-cols-3">
              {KEYS.map((key) => {
                if (!key) {
                  if (!bio) return <span key="hueco" />;
                  return (
                    <button
                      key="huella"
                      type="button"
                      disabled={busy || passed}
                      aria-label="Huella"
                      onClick={() => void usePasskey()}
                      className="grid h-[4.6rem] touch-manipulation place-items-center text-[#1c1915] active:opacity-40 disabled:opacity-40 dark:text-[#e6d3ae]"
                    >
                      <span className="grid h-[3.35rem] w-[3.35rem] place-items-center rounded-full ring-1 ring-[#1c1915]/18 dark:ring-[#e6d3ae]/45">
                        <Fingerprint size={26} strokeWidth={1.4} />
                      </span>
                    </button>
                  );
                }
                const erase = key === 'borrar';
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={busy}
                    aria-label={erase ? 'Borrar' : key}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      tap(key, 'pointer');
                    }}
                    onClick={() => tap(key, 'click')}
                    className="grid h-[4.6rem] touch-manipulation select-none place-items-center text-[1.95rem] font-light tabular-nums leading-none tracking-tight text-[#1c1915] active:opacity-40 disabled:opacity-40 dark:text-[#f6f1e8]"
                  >
                    {erase ? <ArrowLeft size={26} strokeWidth={1.75} /> : key}
                  </button>
                );
              })}
            </div>
          )}
          {onCancel && !passed && step !== 'password' && (
            <button type="button" onClick={onCancel} aria-label="Cancelar" className="mt-1 grid h-12 w-12 place-items-center rounded-2xl bg-[#1c1915]/[0.05] text-[#1c1915] active:opacity-60 dark:bg-white/[0.06] dark:text-[#f6f1e8]">
              <ArrowLeft size={20} strokeWidth={1.75} />
            </button>
          )}
          {forgot && step === 'password' && !passed && (
            <button
              type="button"
              onClick={() => {
                forgotRef.current = false;
                setForgot(false);
                freshRef.current = '';
                writeDigits('');
                writeStep('pin');
                setError('');
              }}
              className="mt-6 text-[15px] text-[#8a8175] dark:text-[#9c9184]"
            >
              Volver al código
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(screen, document.body);
}
