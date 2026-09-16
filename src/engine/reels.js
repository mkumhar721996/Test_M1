import { nextInt } from './rng.js';

/** @typedef {import('./fixtures/reels.fixture.js').ReelStrip} ReelStrip */

/**
 * Picks a stop index uniformly from the valid positions on the given reel strip.
 * @param {() => number} rng
 * @param {ReelStrip} strip
 * @returns {number}
 */
export function pickStop(rng, strip) {
  return nextInt(rng, strip.symbols.length);
}

/**
 * Returns the symbols configured on the strip at the given stop position.
 * @param {ReelStrip} strip
 * @param {number} stop
 * @returns {string[]}
 */
export function symbolsAtStop(strip, stop) {
  return [strip.symbols[stop]];
}
