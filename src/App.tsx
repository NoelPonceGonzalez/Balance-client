import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
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
import { JoinTrip } from '@/views/TripPlan';
import { DeviceAccess } from '@/components/DeviceAccess';
import { TicketCam } from '@/components/TicketCam';

function applyTheme(theme: User['theme']) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

const SECTIONS: Section[] = ['dashboard', 'market', 'plans', 'movements', 'settings'];

function savedSection(): Section {
  const saved = sessionStorage.getItem('pat_section');
  return SECTIONS.includes(saved as Section) ? (saved as Section) : 'dashboard';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [section, setSection] = useState<Section>(savedSection);
  const [home, setHome] = useState(0);
  const [books, setBooks] = useState(0);
  const [heroMs, setHeroMs] = useState(() => Number(localStorage.getItem('pat_hero_ms')) || 5000);
  const [junta, setJunta] = useState<string | null>(null);
  const [ticket, setTicket] = useState(false);
  const [focusPlan, setFocusPlan] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [focusListing, setFocusListing] = useState<string | null>(null);

  useEffect(() => {
    const openPlan = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id) return;
      setFocusPlan(id);
      setFocusTick((value) => value + 1);
      setSection('plans');
    };
    window.addEventListener('pat-plan', openPlan);
    return () => window.removeEventListener('pat-plan', openPlan);
  }, []);

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
    localStorage.removeItem('pat_login_id');
    restoreSession();
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('junta') || '';
    if (/^[A-Za-z0-9_-]{8,24}$/.test(fromUrl)) {
      sessionStorage.setItem('pat_junta', fromUrl);
      params.delete('junta');
      const rest = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    }
    const stored = sessionStorage.getItem('pat_junta') || '';
    if (/^[A-Za-z0-9_-]{8,24}$/.test(stored)) setJunta(stored);
  }, []);

  useEffect(() => {
    sessionStorage.setItem('pat_section', section);
  }, [section]);

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

  useEffect(() => {
    if (!ready) return;
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.classList.add('is-done');
    const timer = window.setTimeout(() => boot.remove(), 460);
    return () => window.clearTimeout(timer);
  }, [ready]);

  if (!ready) return null;
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
  if (!user) return <LoginView onLogin={(next) => { setOffline(false); setSection('dashboard'); setHome((value) => value + 1); setUser(next); }} />;

  return (
    <Shell
      section={section}
      onChange={(next) => { setSection(next); if (next === 'dashboard') setHome((value) => value + 1); }}
      onPlan={(id) => { setFocusPlan(id); setFocusTick((value) => value + 1); setSection('plans'); }}
      onListing={(id) => { setFocusListing(id); setFocusTick((value) => value + 1); setSection('market'); }}
      onTicket={() => setTicket(true)}
      user={user}
      onSettled={() => setBooks((value) => value + 1)}
    >
      <motion.div
        key={section}
        initial={window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={glide}
      >
        {section === 'dashboard' && <Dashboard heroMs={heroMs} home={home} books={books} />}
        {section === 'market' && <Market focusListing={focusListing} focusTick={focusTick} />}
        {section === 'plans' && <Plans books={books} userId={user.id} focusId={focusPlan} focusTick={focusTick} />}
        {section === 'movements' && <Movements />}
        {section === 'settings' && <Settings user={user} heroMs={heroMs} onHero={changeHero} onUser={setUser} onLogout={logout} />}
      </motion.div>
      {junta && (
        <JoinTrip
          code={junta}
          onClose={() => {
            sessionStorage.removeItem('pat_junta');
            setJunta(null);
          }}
          onOpen={(id) => {
            sessionStorage.removeItem('pat_junta');
            setJunta(null);
            setFocusPlan(id);
            setSection('plans');
          }}
        />
      )}
      <DeviceAccess />
      {ticket && (
        <TicketCam
          userId={user.id}
          onClose={() => setTicket(false)}
          onSaved={() => { setTicket(false); setBooks((value) => value + 1); }}
        />
      )}
    </Shell>
  );
}
