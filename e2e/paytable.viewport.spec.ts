import { test, expect } from '@playwright/test';

test('AC5: at a 360px viewport the paytable has no horizontal overflow and scrolls vertically', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');

  await page.getByRole('button', { name: /paytable/i }).click();
  const dialog = page.getByRole('dialog', { name: /paytable/i });
  await expect(dialog).toBeVisible();

  const [scrollWidth, clientWidth] = await dialog.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  const content = page.getByTestId('paytable-content');
  const overflowY = await content.evaluate((el) => getComputedStyle(el).overflowY);
  expect(overflowY).toBe('auto');
});
