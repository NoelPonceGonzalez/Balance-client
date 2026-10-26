import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function runningAsApp() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || nav.standalone === true;
}

export function InstallApp() {
  const [web, setWeb] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    setWeb(!runningAsApp());
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => setWeb(false);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!web) return null;

  const install = async () => {
    if (!prompt) {
      setHelp(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    if (choice.outcome === 'accepted') setWeb(false);
  };

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => void install()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm"
      >
        <Download size={16} />
        Descargar la aplicación
      </button>
      {help && (
        <p className="mt-2 text-center text-xs leading-5 text-slate-500">
          {ios
            ? 'En Safari pulsa Compartir y luego Añadir a pantalla de inicio.'
            : 'En el menú del navegador elige Instalar aplicación o Añadir a pantalla de inicio.'}
        </p>
      )}
    </div>
  );
}
