import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: Number(process.env.ARC_WEB_PORT ?? 3000),
    proxy: {
      '/api': `http://localhost:${process.env.ARC_DEV_PORT ?? 4000}`,
    },
  },
});
