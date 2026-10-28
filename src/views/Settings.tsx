import { useState } from 'react';
import { PasswordReset } from '@/components/PasswordReset';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

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
  const [username, setUsername] = useState(user.username || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [erase, setErase] = useState<'idle' | 'confirm'>('idle');
  const [eraseText, setEraseText] = useState('');

  const saveProfile = async () => {
    setError('');
    try {
      const data = await api<{ user: User }>('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) });
      onUser(data.user);
      setMessage('Nombre guardado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    }
  };

  const saveTheme = async (theme: User['theme']) => {
    const data = await api<{ user: User }>('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ theme }) });
    onUser(data.user);
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Ajustes</h1>
      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
      {message && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>}
      <Card className="space-y-3">
        <h2 className="font-black">Perfil</h2>
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-sm text-slate-500">{user.email}</p>
        <Button onClick={saveProfile}>Guardar</Button>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-black">Contraseña</h2>
        <p className="text-sm text-slate-500">Te llega un código a {user.email}. Con ese código eliges la nueva contraseña.</p>
        <PasswordReset email={user.email} lockEmail onDone={onUser} />
      </Card>
      <Card>
        <h2 className="font-black">Apariencia</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['light', 'dark', 'system'] as const).map((theme) => (
            <Button key={theme} variant={user.theme === theme ? 'primary' : 'outline'} onClick={() => saveTheme(theme)}>
              {theme === 'light' ? 'Claro' : theme === 'dark' ? 'Oscuro' : 'Sistema'}
            </Button>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="font-black">Tarjeta principal</h2>
        <p className="mt-1 text-sm text-slate-500">Cada cuánto alterna la variación en euros y el porcentaje. Ahora: {(heroMs / 1000).toFixed(1)} s.</p>
        <input
          className="mt-4 w-full accent-indigo-600"
          type="range"
          min={1000}
          max={8000}
          step={500}
          value={heroMs}
          onChange={(e) => onHero(Number(e.target.value))}
        />
      </Card>
      <Card className="space-y-3">
        <h2 className="font-black">Copia y privacidad</h2>
        <p className="text-sm font-medium text-slate-500">La copia incluye cuentas, piezas, movimientos, planes y el histórico. No incluye la contraseña.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={download}>Descargar copia</Button>
          <Button variant="danger" onClick={onLogout}>Cerrar sesión</Button>
          <a href="/privacidad.html" className="inline-flex items-center rounded-2xl px-3 py-2 text-sm font-bold text-slate-500">Privacidad</a>
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-black">Borrar la cuenta</h2>
        <p className="text-sm font-medium text-slate-500">Se eliminan el usuario, las cuentas, las piezas, los movimientos, los planes, los extras y el histórico. No se puede deshacer.</p>
        {erase === 'idle' ? (
          <Button variant="danger" onClick={() => { setErase('confirm'); setEraseText(''); }}>Borrar mi cuenta</Button>
        ) : (
          <div className="space-y-2">
            <Input label="Escribe borrar" value={eraseText} onChange={(event) => setEraseText(event.target.value)} placeholder="borrar" />
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => void eraseAccount()}>Confirmar borrado</Button>
              <Button variant="outline" onClick={() => { setErase('idle'); setEraseText(''); }}>Cancelar</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
