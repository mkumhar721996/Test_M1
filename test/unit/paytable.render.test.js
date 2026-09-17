import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, fireClick } from '../helpers/domShim.js';
import { createGameState } from '../../src/state/gameState.js';
import { createBetState } from '../../src/state/betState.js';
import { scalePayout } from '../../src/state/engineConfig.js';
import { createPaytableController } from '../../src/components/paytable/Paytable.js';

const fullConfig = {
  symbols: [
    { id: 'bell', name: 'Bell', payoutPerLine: { 3: 5, 4: 10, 5: 20 } },
    { id: 'bar', name: 'Bar', payoutPerLine: { 3: 2, 4: 4, 5: 8 } },
  ],
  paylines: [
    { id: 'line-1', positions: [0, 0, 0, 0, 0], description: 'Straight line across the middle row' },
    { id: 'line-2', positions: [0, 1, 2, 1, 0], description: 'V shape from top to bottom and back' },
  ],
};

function setup(config = fullConfig, betLevels = [1, 2, 5]) {
  installDom();
  const gameState = createGameState('idle');
  const betState = createBetState(betLevels);
  const mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
  const controller = createPaytableController({ config, gameState, betState, mountPoint });
  const trigger = document.createElement('button');
  return { gameState, betState, mountPoint, controller, trigger };
}

function findByText(root, text) {
  if (root.textContent === text && root.children.length === 0) return root;
  for (const child of root.children) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
}

function findByTestId(root, testId) {
  if (root.getAttribute && root.getAttribute('data-testid') === testId) return root;
  for (const child of root.children || []) {
    const found = findByTestId(child, testId);
    if (found) return found;
  }
  return null;
}

test('AC1: opening while idle displays a dialog listing every symbol and every payline', () => {
  const { controller, mountPoint, trigger } = setup();
  controller.open(trigger);

  const dialog = findByTestId(mountPoint, 'paytable-dialog');
  assert.ok(dialog, 'expected a paytable dialog to be rendered');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');

  for (const symbol of fullConfig.symbols) {
    assert.ok(findByText(dialog, symbol.name), `expected symbol name ${symbol.name} to be present`);
  }
  for (const payline of fullConfig.paylines) {
    assert.ok(findByText(dialog, payline.description), `expected payline description to be present`);
  }
});

test('AC2/AC14: displayed payout values equal the engine payout scaled by the current bet', () => {
  const { controller, mountPoint, trigger, betState } = setup();
  betState.setLevel(1);
  controller.open(trigger);

  for (const symbol of fullConfig.symbols) {
    for (const count of Object.keys(symbol.payoutPerLine)) {
      const expected = scalePayout(symbol.payoutPerLine[count], betState.getBetPerLine());
      const cell = findByTestId(mountPoint, `payout-${symbol.id}-${count}`);
      assert.ok(cell, `expected payout cell for ${symbol.id}-${count}`);
      assert.equal(cell.textContent, String(expected));
    }
  }
});

test('AC6: the payout table uses semantic headers for screen readers', () => {
  const { controller, mountPoint, trigger } = setup();
  controller.open(trigger);
  const dialog = findByTestId(mountPoint, 'paytable-dialog');

  function findTag(root, tag) {
    if (root.tagName === tag) return root;
    for (const child of root.children || []) {
      const found = findTag(child, tag);
      if (found) return found;
    }
    return null;
  }
  const foundTable = findTag(dialog, 'TABLE');
  assert.ok(foundTable, 'expected a <table> for symbol payouts');
  const th = findTag(foundTable, 'TH');
  assert.ok(th, 'expected column headers');
  assert.equal(th.getAttribute('scope'), 'col');
});

test('AC18: missing config shows an inline error message', () => {
  const { controller, mountPoint, trigger } = setup(null);
  controller.open(trigger);
  assert.ok(findByText(mountPoint, 'Paytable is currently unavailable.'));
});

test('AC18: empty symbols/paylines shows an inline error message', () => {
  const { controller, mountPoint, trigger } = setup({ symbols: [], paylines: [] });
  controller.open(trigger);
  assert.ok(findByText(mountPoint, 'Paytable is currently unavailable.'));
});

test('AC19: dismissing the inline error removes it from view', () => {
  const { controller, mountPoint, trigger } = setup(null);
  controller.open(trigger);
  const dismissButton = findByTestId(mountPoint, 'paytable-error-dismiss');
  assert.ok(dismissButton);
  fireClick(dismissButton);
  assert.equal(findByText(mountPoint, 'Paytable is currently unavailable.'), null);
});
