const SPIN_PLACEHOLDER_SYMBOLS = ['?', '?', '?'];

export function renderGrid(container, state) {
  container.innerHTML = '';

  state.reelStates.forEach((reelState, reelIndex) => {
    const reelEl = document.createElement('div');
    reelEl.dataset.reel = String(reelIndex);
    reelEl.classList.add('reel');

    if (reelState === 'spinning') {
      reelEl.classList.add('reel--spinning');

      const stripEl = document.createElement('div');
      stripEl.classList.add('reel-strip');
      [...SPIN_PLACEHOLDER_SYMBOLS, ...SPIN_PLACEHOLDER_SYMBOLS].forEach((symbol) => {
        const placeholderEl = document.createElement('div');
        placeholderEl.classList.add('reel-cell', 'reel-cell--placeholder');
        placeholderEl.textContent = symbol;
        stripEl.appendChild(placeholderEl);
      });
      reelEl.appendChild(stripEl);
    }

    const symbols = state.finalSymbols[reelIndex];
    if (reelState === 'stopped' && symbols) {
      symbols.forEach((symbol, rowIndex) => {
        const cellEl = document.createElement('div');
        cellEl.classList.add('reel-cell');
        cellEl.dataset.reel = String(reelIndex);
        cellEl.dataset.row = String(rowIndex);
        cellEl.dataset.symbol = symbol;
        cellEl.textContent = symbol;
        reelEl.appendChild(cellEl);
      });
    }

    container.appendChild(reelEl);
  });
}
