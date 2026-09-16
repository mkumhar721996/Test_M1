import test from 'node:test';
import assert from 'node:assert/strict';
import { BET_LEVELS, BetSelector } from './bet-selector.js';

test('AC1: exposes exactly the four fixed bet levels', () => {
  assert.deepEqual(BET_LEVELS, [10, 20, 50, 100]);
});

test('AC2: defaults to the lowest bet level', () => {
  const selector = new BetSelector(1000);
  assert.equal(selector.activeBet, 10);
});

test('AC3: selecting a level confirms it as the active bet', () => {
  const selector = new BetSelector(1000);
  assert.equal(selector.select(50), true);
  assert.equal(selector.activeBet, 50);
});

test('AC4: a level above the balance is disabled and cannot be selected', () => {
  const selector = new BetSelector(15);
  assert.equal(selector.isDisabled(50), true);
  assert.equal(selector.select(50), false);
  assert.equal(selector.activeBet, 10);
});

test('AC5: rejects a change while a spin is in progress, until it completes', () => {
  const selector = new BetSelector(1000);
  selector.setSpinInProgress(true);
  assert.equal(selector.select(100), false);
  assert.equal(selector.activeBet, 10);
  selector.setSpinInProgress(false);
  assert.equal(selector.select(100), true);
  assert.equal(selector.activeBet, 100);
});

test('AC4: raising the balance re-enables a previously disabled level', () => {
  const selector = new BetSelector(15);
  assert.equal(selector.isDisabled(50), true);
  selector.setBalance(1000);
  assert.equal(selector.isDisabled(50), false);
});
