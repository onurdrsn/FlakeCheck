import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'static',
  build: { outDir: 'public', emptyOutDir: true },
  server: {
    proxy: {
      '/api': {
        target: process.env.FLAKECHECK_GATEWAY_URL ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
