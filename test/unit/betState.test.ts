import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBetState } from '../../src/state/betState.ts';

test('createBetState defaults to the first level', () => {
  const betState = createBetState([0.1, 0.5, 1]);
  assert.equal(betState.getLevelIndex(), 0);
  assert.equal(betState.getBetPerLine(), 0.1);
});

test('createBetState accepts an initial index', () => {
  const betState = createBetState([0.1, 0.5, 1], 2);
  assert.equal(betState.getLevelIndex(), 2);
  assert.equal(betState.getBetPerLine(), 1);
});

test('setLevel changes the selected level and bet per line', () => {
  const betState = createBetState([0.1, 0.5, 1]);
  betState.setLevel(1);
  assert.equal(betState.getLevelIndex(), 1);
  assert.equal(betState.getBetPerLine(), 0.5);
});

test('setLevel rejects an out-of-range index', () => {
  const betState = createBetState([0.1, 0.5, 1]);
  assert.throws(() => betState.setLevel(5));
});

test('createBetState requires a non-empty levels array', () => {
  assert.throws(() => createBetState([]));
});
