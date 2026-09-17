import { test, expect, type Page } from '@playwright/test';

async function focusableCountInDialog(page: Page): Promise<number> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="paytable-dialog"]');
    if (!dialog) return 0;
    return dialog.querySelectorAll('button, [tabindex="0"]').length;
  });
}

test('AC7: keyboard-only activation of the trigger opens the paytable', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /paytable/i });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /paytable/i })).toBeVisible();
});

test('AC8: tabbing through the dialog scrolls content so the last row becomes reachable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /paytable/i }).click();

  const count = await focusableCountInDialog(page);
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
  }

  await expect(page.getByTestId('paytable-row-last')).toBeInViewport();
});

test('AC9: the close button closes the paytable via keyboard only', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /paytable/i }).click();

  await page.getByRole('button', { name: /close paytable/i }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /paytable/i })).toBeHidden();
});

test('AC10: focus never escapes the open dialog while tabbing repeatedly', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /paytable/i }).click();

  const count = await focusableCountInDialog(page);
  for (let i = 0; i < count + 3; i++) {
    await page.keyboard.press('Tab');
  }

  const stillInside = await page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="paytable-dialog"]');
    return dialog ? dialog.contains(document.activeElement) : false;
  });
  expect(stillInside).toBe(true);
});

test('AC11: closing returns focus to the control that opened the paytable', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: /paytable/i });
  await opener.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /close paytable/i }).focus();
  await page.keyboard.press('Enter');
  await expect(opener).toBeFocused();
});
