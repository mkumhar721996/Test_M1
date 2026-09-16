import { createRng } from './rng.js';
import { validateSeed, generateSeed } from './seed.js';
import { pickStop, symbolsAtStop } from './reels.js';

/** @typedef {import('./fixtures/reels.fixture.js').ReelStrip} ReelStrip */
/** @typedef {{ seed?: unknown, reels: ReelStrip[] }} SpinRequest */
/** @typedef {{ seed: number, stops: number[], symbols: string[][] }} SpinResult */

/**
 * Executes a spin: resolves the seed (validating a supplied one or
 * auto-generating one), then draws one stop per reel from a single
 * deterministic PRNG stream derived from that seed.
 * @param {SpinRequest} request
 * @returns {SpinResult}
 */
export function spin(request) {
  const seed = request.seed === undefined ? generateSeed() : validateSeed(request.seed);
  const rng = createRng(seed);

  const stops = request.reels.map((strip) => pickStop(rng, strip));
  const symbols = request.reels.map((strip, i) => symbolsAtStop(strip, stops[i]));

  return { seed, stops, symbols };
}
