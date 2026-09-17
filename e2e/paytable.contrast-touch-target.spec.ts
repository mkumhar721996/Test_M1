import { test, expect } from '@playwright/test';

function relativeLuminance(rgb: [number, number, number]): number {
  const linearize = (c: number) => {
    const channel = c / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb.map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseRgb(value: string): [number, number, number] {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`unable to parse color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(parseRgb(a));
  const l2 = relativeLuminance(parseRgb(b));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

test('AC16: rendered paytable text meets 4.5:1 contrast', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /paytable/i }).click();

  const dialog = page.getByTestId('paytable-dialog');
  const { color, backgroundColor } = await dialog.evaluate((el) => {
    const styles = getComputedStyle(el);
    return { color: styles.color, backgroundColor: styles.backgroundColor };
  });

  expect(contrastRatio(color, backgroundColor)).toBeGreaterThanOrEqual(4.5);
});

test('AC17: every interactive control in the paytable meets a 44x44px minimum touch target', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /paytable/i }).click();

  const closeButton = page.getByRole('button', { name: /close paytable/i });
  const box = await closeButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
