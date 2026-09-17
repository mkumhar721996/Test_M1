import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, fireClick } from '../helpers/domShim.ts';
import { createGameState } from '../../src/state/gameState.ts';
import { createPaytableControl } from '../../src/components/paytableControl/PaytableControl.ts';

test('the control is enabled and native button while idle, and opens on click (AC7)', () => {
  installDom();
  const gameState = createGameState('idle');
  let openedWith = null;
  const button = createPaytableControl({ gameState, onOpen: (trigger) => (openedWith = trigger) });

  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.disabled, false);
  fireClick(button);
  assert.equal(openedWith, button);
});

test('the control is disabled while a spin is in progress (AC12)', () => {
  installDom();
  const gameState = createGameState('spinning');
  const button = createPaytableControl({ gameState, onOpen: () => {} });
  assert.equal(button.disabled, true);
});

test('the control is disabled while a bonus round is active (AC12)', () => {
  installDom();
  const gameState = createGameState('bonus');
  const button = createPaytableControl({ gameState, onOpen: () => {} });
  assert.equal(button.disabled, true);
});

test('the control updates its disabled state as gameState changes (AC12)', () => {
  installDom();
  const gameState = createGameState('idle');
  const button = createPaytableControl({ gameState, onOpen: () => {} });
  gameState.setStatus('spinning');
  assert.equal(button.disabled, true);
  gameState.setStatus('idle');
  assert.equal(button.disabled, false);
});

test('clicking the control while not idle does not invoke onOpen (AC12/13)', () => {
  installDom();
  const gameState = createGameState('spinning');
  let called = false;
  const button = createPaytableControl({ gameState, onOpen: () => (called = true) });
  fireClick(button);
  assert.equal(called, false);
});
