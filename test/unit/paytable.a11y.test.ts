import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installDom } from '../helpers/domShim.ts';
import { createGameState } from '../../src/state/gameState.ts';
import { createBetState } from '../../src/state/betState.ts';
import { createPaytableController } from '../../src/components/paytable/Paytable.ts';

const fullConfig = {
  symbols: [{ id: 'bell', name: 'Bell', payoutPerLine: { 3: 5 } }],
  paylines: [{ id: 'line-1', positions: [0, 0, 0], description: 'Straight line across the middle row' }],
};

function collectFocusable(root, acc = []) {
  if (root.tagName === 'BUTTON' || root.tabIndex === 0) acc.push(root);
  for (const child of root.children || []) collectFocusable(child, acc);
  return acc;
}

test('AC6: every interactive control inside the paytable has an accessible name', () => {
  installDom();
  const gameState = createGameState('idle');
  const betState = createBetState([1]);
  const mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
  const controller = createPaytableController({ config: fullConfig, gameState, betState, mountPoint });
  controller.open(document.createElement('button'));

  const controls = collectFocusable(mountPoint);
  assert.ok(controls.length > 0);
  for (const control of controls) {
    const accessibleName = control.getAttribute('aria-label') || control.textContent;
    assert.ok(accessibleName && accessibleName.trim().length > 0, 'every control needs an accessible name');
  }
});

test('AC6: the dialog is labelled by a visible title element that exists in the DOM', () => {
  installDom();
  const gameState = createGameState('idle');
  const betState = createBetState([1]);
  const mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
  const controller = createPaytableController({ config: fullConfig, gameState, betState, mountPoint });
  controller.open(document.createElement('button'));

  function findById(root, id) {
    if (root.id === id) return root;
    for (const child of root.children || []) {
      const found = findById(child, id);
      if (found) return found;
    }
    return null;
  }

  const dialog = mountPoint.children.find((c) => c.getAttribute('data-testid') === 'paytable-dialog');
  const labelId = dialog.getAttribute('aria-labelledby');
  const titleEl = findById(dialog, labelId);
  assert.ok(titleEl, 'aria-labelledby must point to an element that exists');
  assert.equal(titleEl.textContent, 'Paytable');
});

test('AC16: paytable.css only uses the documented AA-contrast token pair for body text', () => {
  const css = readFileSync(new URL('../../src/components/paytable/paytable.css', import.meta.url), 'utf8');
  assert.match(css, /color:\s*var\(--color-fg\)/);
  assert.doesNotMatch(css, /color:\s*#/i, 'paytable.css must use design tokens, not hardcoded hex colors');
});

test('AC17: every interactive control in paytable.css has a 44x44px minimum touch target', () => {
  const css = readFileSync(new URL('../../src/components/paytable/paytable.css', import.meta.url), 'utf8');
  assert.match(css, /\.paytable-btn\s*{[^}]*min-width:\s*44px/);
  assert.match(css, /\.paytable-btn\s*{[^}]*min-height:\s*44px/);
});

test('AC5: paytable.css prevents horizontal overflow and allows vertical scrolling', () => {
  const css = readFileSync(new URL('../../src/components/paytable/paytable.css', import.meta.url), 'utf8');
  assert.match(css, /\.paytable-dialog\s*{[^}]*max-width:\s*100vw/);
  assert.match(css, /\.paytable-dialog\s*{[^}]*overflow-x:\s*hidden/);
  assert.match(css, /\.paytable-content\s*{[^}]*overflow-y:\s*auto/);
});
