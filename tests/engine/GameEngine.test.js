import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/engine/GameEngine.js';
import { GAME_CONFIG } from '../../src/config/index.js';
import { ConfigValidationError } from '../../src/engine/errors.js';

test('initialises without error given the embedded valid config', () => {
  assert.doesNotThrow(() => new GameEngine());
});

test('exposes the full configuration for spin logic to consume', () => {
  const engine = new GameEngine();
  assert.deepEqual(engine.getConfig(), GAME_CONFIG);
});

test('never produces a usable engine instance from an invalid config', () => {
  const invalidFixture = { ...GAME_CONFIG, betLevels: [1, 0, 5] };
  let engine;
  assert.throws(() => {
    engine = new GameEngine(invalidFixture);
  }, ConfigValidationError);
  assert.equal(engine, undefined);
});
