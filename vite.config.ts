import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Desde esta red el nombre del sitio publicado no siempre resuelve a una dirección que conteste.
const EDGE = '64.29.17.195';

function forward(edge: string, name: string): Plugin {
  let chain = Promise.resolve();
  const send = (req: IncomingMessage, res: ServerResponse) => new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const upstream = https.request({
      host: edge,
      servername: name,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: name },
      timeout: 60000,
    }, (up) => {
      const headers = { ...up.headers };
      delete headers['transfer-encoding'];
      delete headers.connection;
      try {
        res.writeHead(up.statusCode || 502, headers);
        up.pipe(res);
      } catch {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      }
      up.on('end', done);
      res.on('close', done);
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
      done();
    });
    req.pipe(upstream);
  });
  return {
    name: 'api-edge',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api') && !url.startsWith('/health')) return next();
        chain = chain.then(() => send(req, res)).catch(() => undefined);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const target = env.PATRIMONIO_API_PROXY || process.env.PATRIMONIO_API_PROXY || 'http://127.0.0.1:3010';
  const host = new URL(target).hostname;
  const pin = host.endsWith('vercel.app');
  const agent = new http.Agent({ keepAlive: false, maxSockets: 1 });
  return {
    base: '/',
    plugins: [react(), tailwindcss(), ...(pin ? [forward(EDGE, host)] : [])],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: true,
      port: 5181,
      strictPort: true,
      proxy: pin ? undefined : {
        '/api': { target, changeOrigin: true, agent, timeout: 12000, proxyTimeout: 12000 },
        '/health': { target, changeOrigin: true, agent, timeout: 12000, proxyTimeout: 12000 },
      },
    },
  };
});
