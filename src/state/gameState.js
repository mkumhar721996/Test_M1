export function createGameState(initial = 'idle') {
  let status = initial;
  const listeners = new Set();

  return {
    getStatus() {
      return status;
    },
    setStatus(next) {
      status = next;
      for (const listener of listeners) listener(status);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
