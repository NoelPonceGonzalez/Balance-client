import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function PasswordReset({
  email = '',
  lockEmail = false,
  onDone,
}: {
  email?: string;
  lockEmail?: boolean;
  onDone?: (user: User, token: string) => void;
}) {
  const [address, setAddress] = useState(email);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      await api('/api/auth/password/code', { method: 'POST', body: JSON.stringify({ email: address.trim() }) });
      setSent(true);
      setInfo('Si ese correo está en Balance, el código llega enseguida. Caduca en 10 minutos.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido enviar el código.');
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api<{ token: string; user: User }>('/api/auth/password/confirm', {
        method: 'POST',
        body: JSON.stringify({ email: address.trim(), code: code.trim(), password }),
      });
      localStorage.setItem('pat_token', data.token);
      onDone?.(data.user, data.token);
      setInfo('Contraseña cambiada.');
      setPassword('');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido cambiar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={sent ? confirm : send} className="space-y-4">
      {!lockEmail && (
        <Input
          label="Correo"
          type="email"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          required
          autoComplete="email"
          placeholder="tu@email.com"
        />
      )}
      {sent && (
        <>
          <Input label="Código" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required pattern="[0-9]{6}" maxLength={6} placeholder="6 números" className="tracking-[0.35em]" />
          <Input
            label="Nueva contraseña"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            icon={<Lock size={16} />}
            placeholder="Mínimo 8 caracteres"
            trailing={
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="rounded-lg p-2 text-slate-400" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
        </>
      )}
      {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
      {info && <p className="text-sm font-medium text-slate-500">{info}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {lockEmail ? (
          <button type="submit" disabled={loading} className="rounded-full border border-slate-200/90 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200">
            {loading ? 'Un momento…' : sent ? 'Guardar contraseña' : 'Enviar código'}
          </button>
        ) : (
          <Button type="submit" className="w-full sm:w-auto" disabled={loading}>
            {loading ? 'Un momento…' : sent ? 'Guardar contraseña' : 'Enviar código'}
          </Button>
        )}
        {sent && (
          lockEmail ? (
            <button type="button" disabled={loading} onClick={() => { setSent(false); setCode(''); setError(''); setInfo(''); }} className="px-2 py-2 text-[13px] font-semibold text-slate-400 disabled:opacity-50">
              Pedir otro
            </button>
          ) : (
            <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={loading} onClick={() => { setSent(false); setCode(''); setError(''); setInfo(''); }}>
              Pedir otro
            </Button>
          )
        )}
      </div>
    </form>
  );
}
