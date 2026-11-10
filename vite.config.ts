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
  const limit = 4;
  let active = 0;
  const waiters: Array<() => void> = [];
  const acquire = () => new Promise<void>((resolve) => {
    if (active < limit) {
      active += 1;
      resolve();
      return;
    }
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
  const release = () => {
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (next) next();
  };
  const readBody = (req: IncomingMessage) => new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.concat(chunks)));
  });
  // A veces el primer intento se queda sin abrir conexión hasta que Windows corta a los 21 s; el siguiente entra al momento.
  const CONNECT_MS = 4000;
  const TRIES = 3;
  const send = (req: IncomingMessage, res: ServerResponse) => new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
      release();
    };
    const fail = (status: number) => {
      if (!res.headersSent) res.writeHead(status);
      res.end();
      done();
    };
    void readBody(req).then((body) => {
      const attempt = (left: number) => {
        let connected = false;
        const upstream = https.request({
          host: edge,
          servername: name,
          method: req.method,
          path: req.url,
          headers: { ...req.headers, host: name, 'content-length': String(body.length) },
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
          up.on('error', done);
          up.on('close', done);
          res.on('close', done);
        });
        let dropped = false;
        const connectTimer = setTimeout(() => {
          if (connected) return;
          dropped = true;
          upstream.destroy();
          if (left > 1) attempt(left - 1);
          else fail(504);
        }, CONNECT_MS);
        upstream.on('socket', (socket) => {
          socket.once('secureConnect', () => {
            connected = true;
            clearTimeout(connectTimer);
          });
        });
        upstream.on('timeout', () => {
          dropped = true;
          upstream.destroy();
          fail(504);
        });
        upstream.on('error', () => {
          clearTimeout(connectTimer);
          if (dropped) return;
          if (!connected && left > 1) attempt(left - 1);
          else fail(502);
        });
        upstream.end(body);
      };
      attempt(TRIES);
    });
  });
  return {
    name: 'api-edge',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api') && !url.startsWith('/health')) return next();
        void acquire().then(() => send(req, res));
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
