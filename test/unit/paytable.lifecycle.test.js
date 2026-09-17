import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, fireKeyDown } from '../helpers/domShim.js';
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

function setup(betLevels = [1, 2, 5]) {
  installDom();
  const gameState = createGameState('idle');
  const betState = createBetState(betLevels);
  const mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
  const controller = createPaytableController({ config: fullConfig, gameState, betState, mountPoint });
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  return { gameState, betState, mountPoint, controller, trigger };
}

function findByTestId(root, testId) {
  if (root.getAttribute && root.getAttribute('data-testid') === testId) return root;
  for (const child of root.children || []) {
    const found = findByTestId(child, testId);
    if (found) return found;
  }
  return null;
}

test('AC3: closing the paytable never mutates game status', () => {
  const { controller, gameState, trigger } = setup();
  assert.equal(gameState.getStatus(), 'idle');
  controller.open(trigger);
  controller.close();
  assert.equal(gameState.getStatus(), 'idle');
});

test('AC4: a bet selection made before opening survives an open/close cycle', () => {
  const { controller, betState, trigger } = setup();
  betState.setLevel(2);
  controller.open(trigger);
  controller.close();
  assert.equal(betState.getLevelIndex(), 2);
});

test('AC13: opening cannot succeed while the game is not idle', () => {
  const { controller, gameState, mountPoint, trigger } = setup();
  gameState.setStatus('spinning');
  controller.open(trigger);
  assert.equal(findByTestId(mountPoint, 'paytable-dialog'), null);
  assert.equal(controller.isOpen(), false);
});

test('AC15: a bet change while closed is reflected the next time it opens', () => {
  const { controller, betState, mountPoint, trigger } = setup();
  betState.setLevel(1);
  controller.close();
  betState.setLevel(2);
  controller.open(trigger);

  const symbol = fullConfig.symbols[0];
  const expected = scalePayout(symbol.payoutPerLine[3], betState.getBetPerLine());
  const cell = findByTestId(mountPoint, `payout-${symbol.id}-3`);
  assert.equal(cell.textContent, String(expected));
});

test('AC9/AC11: the close button closes the dialog and returns focus to the trigger', () => {
  const { controller, mountPoint, trigger } = setup();
  controller.open(trigger);
  const closeButton = findByTestId(mountPoint, 'paytable-close');
  closeButton.focus();
  fireKeyDown(closeButton, { key: 'Enter' });
  closeButton.dispatchEvent({ type: 'click', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });

  assert.equal(controller.isOpen(), false);
  assert.equal(document.activeElement, trigger);
});

test('AC10: tabbing forward from the last focusable element wraps back to the first', () => {
  const { controller, mountPoint, trigger } = setup();
  controller.open(trigger);
  const dialog = findByTestId(mountPoint, 'paytable-dialog');
  const focusable = controller.getFocusableElements();
  assert.ok(focusable.length >= 2);

  const last = focusable[focusable.length - 1];
  last.focus();
  const event = fireKeyDown(dialog, { key: 'Tab' });

  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement, focusable[0]);
});

test('AC10: shift+tab from the first focusable element wraps back to the last', () => {
  const { controller, mountPoint, trigger } = setup();
  controller.open(trigger);
  const dialog = findByTestId(mountPoint, 'paytable-dialog');
  const focusable = controller.getFocusableElements();

  focusable[0].focus();
  const event = fireKeyDown(dialog, { key: 'Tab', shiftKey: true });

  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement, focusable[focusable.length - 1]);
});

test('AC11: focus returns to the specific control that opened the paytable', () => {
  const { controller, mountPoint } = setup();
  const triggerA = document.createElement('button');
  const triggerB = document.createElement('button');
  document.body.appendChild(triggerA);
  document.body.appendChild(triggerB);

  controller.open(triggerB);
  const closeButton = findByTestId(mountPoint, 'paytable-close');
  closeButton.focus();
  closeButton.dispatchEvent({ type: 'click', defaultPrevented: false, preventDefault() {} });

  assert.equal(document.activeElement, triggerB);
});
