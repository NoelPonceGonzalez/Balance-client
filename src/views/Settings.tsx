import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { PasswordReset } from '@/components/PasswordReset';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { activateCamera, activatePush, phoneStatus, type Gate } from '@/lib/device';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="px-1 text-[13px] font-semibold text-slate-400">{title}</h2>
      <div className="mt-2 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]">
        {children}
      </div>
    </section>
  );
}

function Line({
  label,
  hint,
  onClick,
  href,
  caret = true,
}: {
  label: string;
  hint?: string;
  onClick?: () => void;
  href?: string;
  caret?: boolean;
}) {
  const className = 'flex w-full items-center gap-3 px-4 py-3.5 text-left';
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-xs font-medium text-slate-400">{hint}</span>}
      </span>
      {caret && <ChevronRight size={16} className="shrink-0 text-slate-300" />}
    </>
  );
  if (href) return <a href={href} className={className}>{body}</a>;
  return <button type="button" onClick={onClick} className={className}>{body}</button>;
}

export function Settings({
  user,
  heroMs,
  onHero,
  onUser,
  onLogout,
}: {
  user: User;
  heroMs: number;
  onHero: (ms: number) => void;
  onUser: (user: User) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [erase, setErase] = useState<'idle' | 'confirm'>('idle');
  const [eraseText, setEraseText] = useState('');
  const [pushGate, setPushGate] = useState<Gate>('ask');
  const [cameraGate, setCameraGate] = useState<Gate>('ask');
  const [deviceNote, setDeviceNote] = useState('');
  const [csfloat, setCsfloat] = useState(false);
  const [csfloatKey, setCsfloatKey] = useState('');
  const [csfloatNote, setCsfloatNote] = useState('');
  const dirty = name.trim() !== user.name.trim() && name.trim().length > 0;

  const refreshDevice = () => {
    void phoneStatus().then((next) => {
      setPushGate(next.push);
      setCameraGate(next.camera);
    });
  };

  useEffect(() => {
    refreshDevice();
    api<{ connected: boolean }>('/api/market/csfloat')
      .then((data) => setCsfloat(data.connected))
      .catch(() => undefined);
  }, []);

  const turnOn = async (kind: 'push' | 'camera') => {
    setError('');
    setDeviceNote('');
    try {
      const message = kind === 'push' ? await activatePush() : await activateCamera();
      setDeviceNote(message);
      refreshDevice();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido activar.');
    }
  };

  const saveCsfloat = async () => {
    setError('');
    setCsfloatNote('');
    try {
      await api('/api/market/csfloat', { method: 'PUT', body: JSON.stringify({ key: csfloatKey.trim() }) });
      setCsfloatKey('');
      setCsfloat(true);
      setCsfloatNote('Guardada. No se vuelve a mostrar.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar la clave.');
    }
  };

  const clearCsfloat = async () => {
    setError('');
    await api('/api/market/csfloat', { method: 'DELETE' });
    setCsfloat(false);
    setCsfloatKey('');
    setCsfloatNote('Clave quitada.');
  };

  const saveProfile = async () => {
    setError('');
    try {
      const data = await api<{ user: User }>('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
      onUser(data.user);
      setName(data.user.name);
      setMessage('Nombre guardado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    }
  };

  const saveTheme = async (theme: User['theme']) => {
    setError('');
    try {
      const data = await api<{ user: User }>('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ theme }) });
      onUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido cambiar el aspecto.');
    }
  };

  const eraseAccount = async () => {
    setError('');
    if (eraseText.trim().toLowerCase() !== 'borrar') {
      setError('Escribe borrar para confirmar.');
      return;
    }
    try {
      await api('/api/auth/me', { method: 'DELETE', body: JSON.stringify({ confirm: 'borrar' }) });
      onLogout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido borrar la cuenta.');
    }
  };

  const download = async () => {
    setError('');
    try {
      const data = await api<unknown>('/api/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `patrimonio-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido exportar.');
    }
  };

  const themes = [
    { id: 'light' as const, label: 'Claro' },
    { id: 'dark' as const, label: 'Oscuro' },
    { id: 'system' as const, label: 'Sistema' },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-8 pb-28">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="mt-1 text-sm font-medium text-slate-400">{user.email}</p>
      </div>

      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

      <section>
        <Input
          label="Nombre"
          value={name}
          onChange={(event) => { setName(event.target.value); setMessage(''); }}
        />
        <div className="mt-2 flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-medium text-slate-400">{message || 'Así apareces en Balance.'}</p>
          {dirty && (
            <button type="button" onClick={() => void saveProfile()} className="shrink-0 rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-200">
              Guardar
            </button>
          )}
        </div>
      </section>

      <Group title="Apariencia">
        <div className="p-3">
          <div className="grid grid-cols-3 gap-1 rounded-full bg-slate-100 p-1 dark:bg-white/10">
            {themes.map((theme) => {
              const on = user.theme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => void saveTheme(theme.id)}
                  className={cn(
                    'rounded-full px-3 py-2 text-[13px] font-semibold',
                    on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 dark:text-slate-400',
                  )}
                >
                  {theme.label}
                </button>
              );
            })}
          </div>
        </div>
      </Group>

      <Group title="Móvil">
        <div className="divide-y divide-slate-100 dark:divide-white/10">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] font-semibold">Avisos</p>
              <p className="text-[13px] font-semibold text-slate-400">{pushGate === 'ready' ? 'Activos' : pushGate === 'blocked' ? 'Bloqueados' : pushGate === 'unsupported' ? 'No disponibles' : 'Apagados'}</p>
            </div>
            {pushGate !== 'unsupported' && (
              <button type="button" onClick={() => void turnOn('push')} className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{pushGate === 'ready' ? 'Probar aviso' : 'Activar'}</button>
            )}
          </div>
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] font-semibold">Cámara</p>
              <p className="text-[13px] font-semibold text-slate-400">{cameraGate === 'ready' ? 'Activa' : cameraGate === 'blocked' ? 'Bloqueada' : cameraGate === 'unsupported' ? 'No disponible' : 'Apagada'}</p>
            </div>
            {cameraGate !== 'ready' && cameraGate !== 'unsupported' && (
              <button type="button" onClick={() => void turnOn('camera')} className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Activar</button>
            )}
          </div>
        </div>
        {deviceNote && <p className="px-4 pb-4 text-xs font-medium leading-5 text-slate-400">{deviceNote}</p>}
      </Group>

      <Group title="En cada sitio">
        <div className="px-4 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[15px] font-semibold">Porcentaje y euros</p>
            <p className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-400">{seconds(heroMs)}</p>
          </div>
          <p className="mt-1 text-xs font-medium text-slate-400">Se turnan en la tarjeta de cada sitio.</p>
          <input
            className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900 dark:bg-white/15 dark:accent-white"
            type="range"
            min={1000}
            max={8000}
            step={500}
            value={heroMs}
            aria-label="Cada cuánto se turnan el porcentaje y los euros"
            onChange={(event) => onHero(Number(event.target.value))}
          />
        </div>
      </Group>

      <Group title="CSFloat">
        <div className="px-4 py-4">
          <p className="text-[15px] font-semibold">{csfloat ? 'Clave guardada' : 'Sin clave'}</p>
          <div className="mt-3">
            <Input
              label={csfloat ? 'Cambiar clave' : 'Clave de Developer'}
              type="password"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={csfloatKey}
              onChange={(event) => { setCsfloatKey(event.target.value); setCsfloatNote(''); }}
              placeholder="Pégala una vez"
            />
          </div>
          <div className="mt-3 flex items-center gap-4">
            {csfloatKey.trim().length >= 20 && (
              <button type="button" onClick={() => void saveCsfloat()} className="text-sm font-semibold text-slate-800 dark:text-slate-100">Guardar</button>
            )}
            {csfloat && (
              <button type="button" onClick={() => void clearCsfloat()} className="text-sm font-semibold text-slate-500">Quitar</button>
            )}
          </div>
          {csfloatNote && <p className="mt-2 text-xs font-medium text-slate-400">{csfloatNote}</p>}
        </div>
      </Group>

      <Group title="Cuenta">
        <div className="divide-y divide-slate-100 dark:divide-white/10">
          <div>
            <Line
              label="Cambiar contraseña"
              hint="Te llega un código al correo."
              caret={!passwordOpen}
              onClick={() => setPasswordOpen((value) => !value)}
            />
            {passwordOpen && (
              <div className="border-t border-slate-100 px-4 py-4 dark:border-white/10">
                <PasswordReset email={user.email} lockEmail onDone={onUser} />
              </div>
            )}
          </div>
          <Line label="Descargar copia" hint="Cuentas, piezas, movimientos y planes. Sin la contraseña." onClick={() => void download()} />
          <Line label="Privacidad" href="/privacidad.html" />
          <Line label="Cerrar sesión" caret={false} onClick={onLogout} />
        </div>
      </Group>

      <div className="px-1">
        {erase === 'idle' ? (
          <button type="button" onClick={() => { setErase('confirm'); setEraseText(''); setError(''); }} className="text-sm font-semibold text-rose-600">
            Borrar la cuenta
          </button>
        ) : (
          <div className="rounded-[28px] bg-white px-4 py-4 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Se elimina todo y no se puede deshacer. Escribe borrar para confirmar.</p>
            <div className="mt-3">
              <Input label="Escribe borrar" value={eraseText} onChange={(event) => setEraseText(event.target.value)} placeholder="borrar" />
            </div>
            <div className="mt-3 flex items-center gap-4">
              <button type="button" onClick={() => void eraseAccount()} className="text-sm font-semibold text-rose-600">Confirmar</button>
              <button type="button" onClick={() => { setErase('idle'); setEraseText(''); }} className="text-sm font-semibold text-slate-500">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
