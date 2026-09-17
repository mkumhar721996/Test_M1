import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: Number(process.env.ARC_DEV_PORT) || 5173,
  },
  preview: {
    port: Number(process.env.ARC_WEB_PORT) || 4173,
  },
});
