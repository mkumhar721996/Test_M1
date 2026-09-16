import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../src/config/index.js';
import { validateConfig } from '../../src/engine/validateConfig.js';

const CONFIG_FILES = [
  'src/config/symbols.js',
  'src/config/reelStrips.js',
  'src/config/grid.js',
  'src/config/paylines.js',
  'src/config/betLevels.js',
  'src/config/index.js',
];

test('has no runtime I/O in config sources', () => {
  for (const file of CONFIG_FILES) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /readFile|process\.env|fetch\(|require\(|import\(/);
  }
});

test('exposes a fully-populated GameConfig with no constructor arguments needed', () => {
  assert.deepEqual(GAME_CONFIG.grid, { reels: 5, rows: 3 });
  assert.ok(GAME_CONFIG.symbols.length > 0);
  assert.equal(GAME_CONFIG.reelStrips.length, GAME_CONFIG.grid.reels);
});

test('defines exactly 9 paylines, all within grid bounds', () => {
  assert.equal(GAME_CONFIG.paylines.length, 9);
  assert.doesNotThrow(() => validateConfig(GAME_CONFIG));
});

test('defines exactly the bet levels 1, 2, 5, and 10', () => {
  assert.deepEqual(GAME_CONFIG.betLevels, [1, 2, 5, 10]);
});
