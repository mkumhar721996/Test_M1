export type GameStatus = 'idle' | 'spinning' | 'bonus';

export interface GameState {
  getStatus(): GameStatus;
  setStatus(next: GameStatus): void;
  subscribe(fn: (status: GameStatus) => void): () => void;
}

export function createGameState(initial: GameStatus = 'idle'): GameState {
  let status = initial;
  const listeners = new Set<(status: GameStatus) => void>();

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
