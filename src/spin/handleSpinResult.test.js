import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSpinResult } from './handleSpinResult.js';

test('displays the updated balance after a win', () => {
  const balanceContainer = { textContent: '' };
  const spinButton = { disabled: true };
  const newBalance = handleSpinResult({
    postDeductionBalance: 100,
    winningAmount: 25,
    balanceContainer,
    spinButton,
  });
  assert.equal(newBalance, 125);
  assert.equal(balanceContainer.textContent, '125');
});

test('keeps the post-deduction balance when the engine returns zero winnings', () => {
  const balanceContainer = { textContent: '' };
  const spinButton = { disabled: true };
  const newBalance = handleSpinResult({
    postDeductionBalance: 80,
    winningAmount: 0,
    balanceContainer,
    spinButton,
  });
  assert.equal(newBalance, 80);
  assert.equal(balanceContainer.textContent, '80');
});

test('re-enables the spin button only after the balance display has been updated', () => {
  const order = [];
  const balanceContainer = {
    set textContent(value) {
      order.push(['display', value]);
    },
  };
  const spinButton = {
    _disabled: true,
    get disabled() {
      return this._disabled;
    },
    set disabled(value) {
      order.push(['button-disabled', value]);
      this._disabled = value;
    },
  };
  handleSpinResult({
    postDeductionBalance: 50,
    winningAmount: 10,
    balanceContainer,
    spinButton,
  });
  assert.deepEqual(order, [
    ['display', '60'],
    ['button-disabled', false],
  ]);
});
