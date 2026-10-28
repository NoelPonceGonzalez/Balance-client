import { useEffect, useState, type FormEvent } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { InstallApp } from '@/components/InstallApp';
import { Mark } from '@/components/Mark';
import { PasswordReset } from '@/components/PasswordReset';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { User as AppUser } from '@/lib/types';

export function LoginView({ onLogin }: { onLogin: (user: AppUser, token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginReady, setLoginReady] = useState(false);
  const [passwordReady, setPasswordReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recover, setRecover] = useState(false);

  useEffect(() => {
    localStorage.removeItem('pat_login_id');
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'register' && !/^[a-zA-Z][a-zA-Z0-9._-]{2,23}$/.test(username.trim())) {
        throw new Error('El usuario empieza por una letra y tiene entre 3 y 24 caracteres.');
      }
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' ? { login: login.trim(), password } : { name, username: username.trim(), email, password };
      const data = await api<{ token: string; user: AppUser }>(path, { method: 'POST', body: JSON.stringify(body) });
      localStorage.setItem('pat_token', data.token);
      localStorage.removeItem('pat_login_id');
      onLogin(data.user, data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-scroll bg-white text-slate-950">
      <div className="mx-auto flex min-h-full w-full max-w-[26rem] flex-col justify-center px-6 py-14">
        <div className="mb-10">
          <div className="mb-7 grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white">
            <Mark size={24} />
          </div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight">Balance</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Acceso privado. La sesión permanece en este dispositivo hasta que la cierres.</p>
          <div className="mt-5">
            <InstallApp />
          </div>
        </div>

        <div className="mb-8 flex gap-6 border-b border-slate-200">
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setMode(item);
                setError('');
              }}
              className={cn(
                '-mb-px border-b pb-3 text-sm font-semibold',
                mode === item ? 'border-slate-950 text-slate-950' : 'border-transparent text-slate-400',
              )}
            >
              {item === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          ))}
        </div>

        {recover ? (
          <div className="space-y-4">
            <PasswordReset onDone={onLogin} />
            <button type="button" onClick={() => setRecover(false)} className="text-sm font-semibold text-slate-500">
              Volver a entrar
            </button>
          </div>
        ) : (
        <form onSubmit={submit} className="space-y-5" autoComplete="off">
          {mode === 'register' && (
            <>
              <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Cómo quieres que aparezca" />
              <Input label="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" placeholder="noel" spellCheck={false} />
              <Input label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="tu@email.com" />
            </>
          )}
          {mode === 'login' && (
            <Input
              label="Correo o usuario"
              name="pat-login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              readOnly={!loginReady}
              onPointerDown={() => setLoginReady(true)}
              onFocus={() => setLoginReady(true)}
              placeholder="Usuario o correo"
            />
          )}
          <Input
            label="Contraseña"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            name={mode === 'login' ? 'pat-secret' : undefined}
            autoComplete={mode === 'login' ? 'off' : 'new-password'}
            readOnly={mode === 'login' && !passwordReady}
            onPointerDown={() => setPasswordReady(true)}
            onFocus={() => setPasswordReady(true)}
            icon={<Lock size={16} />}
            placeholder="Mínimo 8 caracteres"
            trailing={
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="rounded-lg p-2 text-slate-400" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
          {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
          <Button type="submit" variant="secondary" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </Button>
          {mode === 'login' && (
            <button type="button" onClick={() => setRecover(true)} className="w-full text-sm font-semibold text-slate-500">
              Cambiar contraseña
            </button>
          )}
        </form>
        )}
      </div>
    </div>
  );
}
