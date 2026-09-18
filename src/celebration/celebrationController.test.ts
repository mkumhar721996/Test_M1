import { describe, expect, it } from 'vitest';
import { attachCelebration } from './celebrationController';
import { createCelebrationStore } from './celebrationStore';
import type { WinningLine } from './types';

const topRow: WinningLine = {
  id: 'line-1',
  name: 'Top Row',
  symbol: '🔔',
  amount: 5.0,
  positions: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
};

const bottomRow: WinningLine = {
  id: 'line-3',
  name: 'Bottom Row',
  symbol: '💎',
  amount: 15.0,
  positions: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]],
};

function buildDom() {
  const gridEl = document.createElement('div');
  gridEl.className = 'reel-grid';
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  svgEl.setAttribute('class', 'payline-overlay');
  gridEl.appendChild(svgEl);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const cell = document.createElement('div');
      cell.className = 'reel-cell';
      cell.dataset.col = String(col);
      cell.dataset.row = String(row);
      gridEl.insertBefore(cell, svgEl);
    }
  }
  const bannerEl = document.createElement('div');
  bannerEl.className = 'win-banner';
  bannerEl.hidden = true;
  return { gridEl, svgEl, bannerEl };
}

describe('attachCelebration', () => {
  it('AC1/AC2: onResult with winning lines highlights the grid and shows the banner', () => {
    const store = createCelebrationStore();
    const { gridEl, svgEl, bannerEl } = buildDom();
    const controller = attachCelebration(store, { gridEl, svgEl, bannerEl });

    controller.onResult({ winningLines: [topRow, bottomRow], totalWin: 20.0 });

    expect(store.getState()).toBe('celebrating');
    expect(gridEl.querySelectorAll('.reel-cell.is-win').length).toBe(10);
    expect(svgEl.querySelectorAll('polyline').length).toBe(2);
    expect(bannerEl.hidden).toBe(false);
    expect(bannerEl.querySelector('.win-amount')?.textContent).toBe('$20.00');
  });

  it('AC3/AC4: onResult with no winning lines shows no highlights and no banner', () => {
    const store = createCelebrationStore();
    const { gridEl, svgEl, bannerEl } = buildDom();
    const controller = attachCelebration(store, { gridEl, svgEl, bannerEl });

    controller.onResult({ winningLines: [], totalWin: 0 });

    expect(store.getState()).toBe('idle');
    expect(gridEl.querySelectorAll('.reel-cell.is-win').length).toBe(0);
    expect(svgEl.querySelectorAll('polyline').length).toBe(0);
    expect(bannerEl.hidden).toBe(true);
  });

  it('AC5/AC6: onNewSpin after a win clears highlights, overlay, banner and returns to idle', () => {
    const store = createCelebrationStore();
    const { gridEl, svgEl, bannerEl } = buildDom();
    const controller = attachCelebration(store, { gridEl, svgEl, bannerEl });

    controller.onResult({ winningLines: [topRow, bottomRow], totalWin: 20.0 });
    expect(gridEl.querySelectorAll('.reel-cell.is-win').length).toBe(10);

    controller.onNewSpin();

    expect(gridEl.querySelectorAll('.reel-cell.is-win').length).toBe(0);
    expect(svgEl.querySelectorAll('polyline').length).toBe(0);
    expect(bannerEl.hidden).toBe(true);
    expect(store.getState()).toBe('idle');
  });
});
