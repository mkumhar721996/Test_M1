import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: Number(process.env.ARC_WEB_PORT) || 5173 },
  preview: { port: Number(process.env.ARC_WEB_PORT) || 4173 },
  test: { environment: 'jsdom' },
});
