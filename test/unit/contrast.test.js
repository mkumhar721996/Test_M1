import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio } from '../../src/utils/contrast.js';
import tokens from '../../design-system/tokens.json' with { type: 'json' };

test('color-fg on color-bg (used for paytable body text) clears 4.5:1', () => {
  const fg = tokens['color-fg'].$value.hex;
  const bg = tokens['color-bg'].$value.hex;
  assert.ok(contrastRatio(fg, bg) >= 4.5);
});

test('color-fg on color-surface (used for paytable panels) clears 4.5:1', () => {
  const fg = tokens['color-fg'].$value.hex;
  const surface = tokens['color-surface'].$value.hex;
  assert.ok(contrastRatio(fg, surface) >= 4.5);
});

test('contrastRatio computes the standard WCAG relative-luminance ratio', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01);
  assert.equal(contrastRatio('#1a1a1a', '#ffffff'), contrastRatio('#ffffff', '#1a1a1a'));
});
