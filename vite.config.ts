import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

// Desde esta red solo algunas direcciones del sitio publicado responden, y no a la vez.
// Si se abren varias conexiones juntas, el resto se cae. Se usa una y, si falla, la otra.
const POOL = ['216.198.79.3', '216.198.79.67'];
let poolIndex = 0;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const target = env.PATRIMONIO_API_PROXY || process.env.PATRIMONIO_API_PROXY || 'http://127.0.0.1:3010';
  const host = new URL(target).hostname;
  const pin = host.endsWith('vercel.app');
  const lookup: net.LookupFunction = (hostname, options, callback) => {
    const address = pin && !net.isIP(hostname) ? POOL[poolIndex % POOL.length] : hostname;
    if (typeof options === 'object' && options.all) callback(null, [{ address, family: 4 }]);
    else callback(null, address, 4);
  };
  const agent = target.startsWith('https:')
    ? new https.Agent({ keepAlive: false, maxSockets: 1, lookup })
    : new http.Agent({ keepAlive: false, maxSockets: 1, lookup });
  const shared = {
    target,
    changeOrigin: true,
    agent,
    timeout: 6000,
    proxyTimeout: 6000,
    configure(proxy: { on: (event: 'error', listener: () => void) => void }) {
      proxy.on('error', () => {
        poolIndex = (poolIndex + 1) % POOL.length;
      });
    },
  };
  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: true,
      port: 5181,
      strictPort: true,
      proxy: {
        '/api': { ...shared },
        '/health': { ...shared },
      },
    },
  };
});
