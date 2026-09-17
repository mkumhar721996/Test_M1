import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setupTests.ts'],
    include: ['test/unit/**/*.test.ts'],
  },
});
