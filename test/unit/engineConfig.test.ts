import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngineConfig, scalePayout } from '../../src/state/engineConfig.ts';

const validRaw = {
  symbols: [
    { id: 'bell', name: 'Bell', payoutPerLine: { 3: 5, 4: 10, 5: 20 } },
    { id: 'bar', name: 'Bar', payoutPerLine: { 3: 2, 4: 4, 5: 8 } },
  ],
  paylines: [
    { id: 'line-1', positions: [0, 0, 0, 0, 0], description: 'Straight line across the middle row' },
    { id: 'line-2', positions: [0, 1, 2, 1, 0], description: 'V shape from top to bottom and back' },
  ],
};

test('loadEngineConfig returns the config unchanged when it is well-formed', () => {
  const result = loadEngineConfig(validRaw);
  assert.deepEqual(result, validRaw);
});

test('loadEngineConfig returns null for null input', () => {
  assert.equal(loadEngineConfig(null), null);
});

test('loadEngineConfig returns null when symbols is missing or empty', () => {
  assert.equal(loadEngineConfig({ symbols: [], paylines: validRaw.paylines }), null);
  assert.equal(loadEngineConfig({ paylines: validRaw.paylines }), null);
});

test('loadEngineConfig returns null when paylines is missing or empty', () => {
  assert.equal(loadEngineConfig({ symbols: validRaw.symbols, paylines: [] }), null);
  assert.equal(loadEngineConfig({ symbols: validRaw.symbols }), null);
});

test('loadEngineConfig returns null when a symbol is malformed', () => {
  const malformed = {
    symbols: [{ id: 'bell' }],
    paylines: validRaw.paylines,
  };
  assert.equal(loadEngineConfig(malformed), null);
});

test('scalePayout multiplies the configured multiplier by the bet per line exactly', () => {
  assert.equal(scalePayout(5, 2), 10);
  assert.equal(scalePayout(20, 0.5), 10);
});
