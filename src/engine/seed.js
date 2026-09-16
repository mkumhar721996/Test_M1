import { randomInt } from 'node:crypto';

export const SEED_MIN = 0;
export const SEED_MAX = 2 ** 32 - 1;

export class InvalidSeedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidSeedError';
  }
}

/**
 * Validates that a seed is an integer within [SEED_MIN, SEED_MAX].
 * @param {unknown} seed
 * @returns {number}
 */
export function validateSeed(seed) {
  if (typeof seed !== 'number' || !Number.isInteger(seed)) {
    throw new InvalidSeedError('Seed must be an integer number');
  }
  if (seed < SEED_MIN || seed > SEED_MAX) {
    throw new InvalidSeedError(`Seed must be between ${SEED_MIN} and ${SEED_MAX}`);
  }
  return seed;
}

/**
 * Generates a random seed within [SEED_MIN, SEED_MAX] for use when the caller
 * does not supply one.
 * @returns {number}
 */
export function generateSeed() {
  return randomInt(SEED_MIN, SEED_MAX + 1);
}
