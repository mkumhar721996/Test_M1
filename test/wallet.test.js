import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWallet, placeBet, STARTING_BALANCE } from '../src/wallet.js';

test('createWallet starts at 1,000 credits', () => {
  const wallet = createWallet();
  assert.equal(wallet.balance, 1000);
  assert.equal(STARTING_BALANCE, 1000);
});

test('placeBet deducts the bet amount from the balance', () => {
  const wallet = createWallet();
  const updated = placeBet(wallet, 250);
  assert.equal(updated.balance, 750);
});

test('placeBet rejects a bet larger than the balance', () => {
  const wallet = createWallet();
  assert.throws(() => placeBet(wallet, 1001), /Invalid bet amount/);
});

test('placeBet rejects a non-positive bet amount', () => {
  const wallet = createWallet();
  assert.throws(() => placeBet(wallet, 0), /Invalid bet amount/);
});
