/**
 * Creates a deterministic pseudo-random number generator (mulberry32) seeded
 * from a 32-bit unsigned integer. The returned function produces a new
 * float in [0, 1) on each call, and the sequence is fully determined by seed.
 * @param {number} seed
 * @returns {() => number}
 */
export function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draws a uniformly-distributed integer in [0, exclusiveMax) using the given rng.
 * @param {() => number} rng
 * @param {number} exclusiveMax
 * @returns {number}
 */
export function nextInt(rng, exclusiveMax) {
  return Math.floor(rng() * exclusiveMax);
}
