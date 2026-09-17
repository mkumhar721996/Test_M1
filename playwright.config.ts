import { defineConfig } from '@playwright/test';

const port = Number(process.env.ARC_WEB_PORT) || 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command: 'npm run preview',
    port,
    reuseExistingServer: !process.env.CI,
  },
});
