import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBetSelector } from './bet-selector-view.js';
import { BetSelector } from '../betting/bet-selector.js';
import { createFakeContainer } from '../testing/fake-dom.js';

function findByLevel(container, level) {
  return container.children.find((child) => child.dataset.betLevel === String(level));
}

test('AC1: renders exactly four bet options', () => {
  const container = createFakeContainer();
  renderBetSelector(container, new BetSelector(1000));
  assert.equal(container.children.length, 4);
});

test('AC2: the lowest bet level is pre-selected as active', () => {
  const container = createFakeContainer();
  renderBetSelector(container, new BetSelector(1000));
  assert.equal(findByLevel(container, 10).classList.contains('is-active'), true);
});

test('AC3: clicking a level shows it as the active bet', () => {
  const container = createFakeContainer();
  const selector = new BetSelector(1000);
  renderBetSelector(container, selector);
  findByLevel(container, 50).click();
  assert.equal(selector.activeBet, 50);
  assert.equal(findByLevel(container, 50).classList.contains('is-active'), true);
  assert.equal(findByLevel(container, 10).classList.contains('is-active'), false);
});

test('AC4: a level above the balance is rendered disabled', () => {
  const container = createFakeContainer();
  renderBetSelector(container, new BetSelector(15));
  assert.equal(findByLevel(container, 50).disabled, true);
});

test('AC5: clicking a level while a spin is in progress has no effect', () => {
  const container = createFakeContainer();
  const selector = new BetSelector(1000);
  selector.setSpinInProgress(true);
  renderBetSelector(container, selector);
  findByLevel(container, 100).click();
  assert.equal(selector.activeBet, 10);
  assert.equal(findByLevel(container, 100).classList.contains('is-active'), false);
});
