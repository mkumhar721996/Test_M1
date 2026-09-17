import { test, expect } from '@playwright/test';

test('controls are reachable without horizontal scrolling at 360px width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');
  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalScroll).toBe(false);
  await expect(page.getByRole('button', { name: /spin/i })).toBeVisible();
  await expect(page.getByLabel('Bet amount')).toBeVisible();
});
