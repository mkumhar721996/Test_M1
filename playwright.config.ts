import { defineConfig } from '@playwright/test';

const port = Number(process.env.ARC_WEB_PORT) || 5173;

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npm run dev',
    port,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: `http://localhost:${port}`,
  },
});
