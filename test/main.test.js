import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDocument } from './support/fakeDocument.js';
import { initGame } from '../src/main.js';

function submitBet(doc, amount) {
  doc.querySelector('#bet-amount').value = String(amount);
  const submitEvent = new Event('submit', { cancelable: true });
  doc.querySelector('#bet-form').dispatchEvent(submitEvent);
}

test('AC1: displays a balance of 1,000 credits on load', () => {
  const doc = createFakeDocument();
  initGame(doc);
  assert.match(doc.querySelector('#balance').textContent, /1,000/);
});

test('AC2: lets the player place a bet using the displayed balance', () => {
  const doc = createFakeDocument();
  const wallet = initGame(doc);
  submitBet(doc, 250);
  assert.equal(wallet.balance, 750);
  assert.match(doc.querySelector('#balance').textContent, /750/);
});

test('AC3: a fresh init (simulated reload) resets the balance to 1,000', () => {
  const doc = createFakeDocument();
  const wallet = initGame(doc);
  submitBet(doc, 400);
  assert.equal(wallet.balance, 600);

  const reloadedDoc = createFakeDocument();
  const reloadedWallet = initGame(reloadedDoc);
  assert.equal(reloadedWallet.balance, 1000);
  assert.match(reloadedDoc.querySelector('#balance').textContent, /1,000/);
});

test('AC4: shows no login, registration, or account UI', () => {
  const doc = createFakeDocument();
  initGame(doc);
  assert.equal(doc.querySelector('input[type="password"]'), null);
  assert.doesNotMatch(doc.body.textContent.toLowerCase(), /log ?in|sign ?up|register|account/);
});

test('an invalid bet does not throw and announces an accessible error instead', () => {
  const doc = createFakeDocument();
  const wallet = initGame(doc);
  assert.doesNotThrow(() => submitBet(doc, 5000));
  assert.equal(wallet.balance, 1000);
  const errorDisplay = doc.querySelector('#bet-error');
  assert.match(errorDisplay.textContent, /Invalid bet amount/);
  assert.equal(errorDisplay.getAttribute('role'), 'alert');
  assert.equal(errorDisplay.getAttribute('aria-live'), 'assertive');
});

test('a valid bet after a failed one clears the previous error message', () => {
  const doc = createFakeDocument();
  const wallet = initGame(doc);
  submitBet(doc, 5000);
  assert.match(doc.querySelector('#bet-error').textContent, /Invalid bet amount/);

  submitBet(doc, 100);
  assert.equal(wallet.balance, 900);
  assert.equal(doc.querySelector('#bet-error').textContent, '');
});
