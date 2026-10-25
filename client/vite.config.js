import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.VITE_DEV_API_TARGET ?? 'http://localhost:5000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the browser talks only to Vite (localhost:5173). Vite forwards API and
    // socket traffic to Express, so cookies are first-party and no CORS setup is needed.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
});
