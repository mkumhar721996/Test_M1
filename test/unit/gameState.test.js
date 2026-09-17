import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../../src/state/gameState.js';

test('createGameState defaults to idle', () => {
  const gameState = createGameState();
  assert.equal(gameState.getStatus(), 'idle');
});

test('createGameState accepts an initial status', () => {
  const gameState = createGameState('spinning');
  assert.equal(gameState.getStatus(), 'spinning');
});

test('setStatus updates the status returned by getStatus', () => {
  const gameState = createGameState('idle');
  gameState.setStatus('bonus');
  assert.equal(gameState.getStatus(), 'bonus');
});

test('subscribe is notified with the new status on change', () => {
  const gameState = createGameState('idle');
  const seen = [];
  gameState.subscribe((status) => seen.push(status));
  gameState.setStatus('spinning');
  gameState.setStatus('idle');
  assert.deepEqual(seen, ['spinning', 'idle']);
});

test('the unsubscribe function stops further notifications', () => {
  const gameState = createGameState('idle');
  const seen = [];
  const unsubscribe = gameState.subscribe((status) => seen.push(status));
  unsubscribe();
  gameState.setStatus('bonus');
  assert.deepEqual(seen, []);
});
