import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateBalanceDisplay } from './balanceDisplay.js';

test('renders the balance as text content on the container', () => {
  const container = { textContent: '' };
  updateBalanceDisplay(container, 125);
  assert.equal(container.textContent, '125');
});
