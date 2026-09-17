import type { GameState } from '../../state/gameState.ts';

export interface PaytableControlDeps {
  gameState: GameState;
  onOpen: (trigger: HTMLButtonElement) => void;
}

export function createPaytableControl({ gameState, onOpen }: PaytableControlDeps): HTMLButtonElement {
  const button = document.createElement('button');
  button.setAttribute('type', 'button');
  button.classList.add('btn', 'btn-primary', 'paytable-control');
  button.textContent = 'Paytable';
  button.setAttribute('aria-label', 'Open paytable');

  const syncDisabled = (status: string) => {
    button.disabled = status !== 'idle';
  };
  syncDisabled(gameState.getStatus());
  gameState.subscribe(syncDisabled);

  button.addEventListener('click', () => {
    if (gameState.getStatus() !== 'idle') return;
    onOpen(button);
  });

  return button;
}
