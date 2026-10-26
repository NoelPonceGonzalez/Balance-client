import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const target = process.env.PATRIMONIO_API_PROXY || 'http://127.0.0.1:3010';
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
        '/api': { target, changeOrigin: true },
        '/health': { target, changeOrigin: true },
      },
    },
  };
});
