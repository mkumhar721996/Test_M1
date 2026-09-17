export function createBetState(levels, initialIndex = 0) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new Error('createBetState requires a non-empty array of bet levels');
  }
  if (initialIndex < 0 || initialIndex >= levels.length) {
    throw new Error(`bet level index out of range: ${initialIndex}`);
  }

  let index = initialIndex;

  return {
    getBetPerLine() {
      return levels[index];
    },
    getLevelIndex() {
      return index;
    },
    setLevel(next) {
      if (next < 0 || next >= levels.length) {
        throw new Error(`bet level index out of range: ${next}`);
      }
      index = next;
    },
  };
}
