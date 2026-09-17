export function renderGrid(container, state) {
  container.innerHTML = '';

  state.reelStates.forEach((reelState, reelIndex) => {
    const reelEl = document.createElement('div');
    reelEl.dataset.reel = String(reelIndex);
    reelEl.classList.add('reel');

    if (reelState === 'spinning') {
      reelEl.classList.add('reel--spinning');
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
