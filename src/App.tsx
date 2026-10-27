import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { QuietLoad } from '@/components/QuietLoad';
import { Shell, type Section } from '@/components/Shell';
import { api, ApiError } from '@/lib/api';
import { glide } from '@/lib/motion';
import type { User } from '@/lib/types';
import { Dashboard } from '@/views/Dashboard';
import { LoginView } from '@/views/Login';
import { Market } from '@/views/Market';
import { Movements } from '@/views/Movements';
import { Plans } from '@/views/Plans';
import { Settings } from '@/views/Settings';

function applyTheme(theme: User['theme']) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [section, setSection] = useState<Section>('dashboard');
  const [home, setHome] = useState(0);
  const [heroMs, setHeroMs] = useState(() => Number(localStorage.getItem('pat_hero_ms')) || 2000);

  const restoreSession = () => {
    const token = localStorage.getItem('pat_token');
    if (!token) {
      setUser(null);
      setOffline(false);
      setReady(true);
      return;
    }
    setReady(false);
    api<{ user: User }>('/api/auth/me')
      .then((data) => {
        setUser(data.user);
        setOffline(false);
      })
      .catch((err: unknown) => {
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 401 || status === 403) {
          localStorage.removeItem('pat_token');
          setUser(null);
          setOffline(false);
        } else {
          setOffline(true);
        }
      })
      .finally(() => setReady(true));
  };

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    if (!user) {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
      return;
    }
    applyTheme(user.theme || 'system');
  }, [user]);

  const changeHero = (ms: number) => {
    setHeroMs(ms);
    localStorage.setItem('pat_hero_ms', String(ms));
  };

  const logout = () => {
    localStorage.removeItem('pat_token');
    setUser(null);
  };

  if (!ready) return <QuietLoad kind="screen" />;
  if (offline && !user) {
    return (
      <div className="grid h-dvh place-items-center bg-white px-6">
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">La sesión sigue guardada</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">No hay conexión con el servidor. Cuando vuelva, entras sin repetir la contraseña.</p>
          <button type="button" onClick={restoreSession} className="mt-6 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">
            Reintentar
          </button>
        </div>
      </div>
    );
  }
  if (!user) return <LoginView onLogin={(next) => { setOffline(false); setUser(next); }} />;

  return (
    <Shell section={section} onChange={(next) => { setSection(next); if (next === 'dashboard') setHome((value) => value + 1); }} user={user}>
      <motion.div
        key={section}
        initial={window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={glide}
      >
        {section === 'dashboard' && <Dashboard heroMs={heroMs} home={home} />}
        {section === 'market' && <Market />}
        {section === 'plans' && <Plans />}
        {section === 'movements' && <Movements />}
        {section === 'settings' && <Settings user={user} heroMs={heroMs} onHero={changeHero} onUser={setUser} onLogout={logout} />}
      </motion.div>
    </Shell>
  );
}
