import { BET_LEVELS } from '../betting/bet-selector.js';

export function renderBetSelector(container, selector) {
  const doc = container.ownerDocument;
  const buttons = BET_LEVELS.map((level) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.classList.add('chip');
    button.dataset.betLevel = String(level);
    button.textContent = String(level);
    button.disabled = selector.isDisabled(level);
    if (level === selector.activeBet) {
      button.classList.add('is-active');
    }
    button.addEventListener('click', () => {
      if (selector.select(level)) {
        renderBetSelector(container, selector);
      }
    });
    return button;
  });
  container.replaceChildren(...buttons);
}
