import type { PayLine } from './types';

// 5 reels x 3 rows (row 0 = top, row 1 = middle, row 2 = bottom): 3 straight lines,
// 2 full V / inverted-V lines, and 4 zig-zag lines.
export const PAY_LINES: readonly PayLine[] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
];
