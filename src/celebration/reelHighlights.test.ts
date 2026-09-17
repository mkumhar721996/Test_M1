import { describe, expect, it } from 'vitest';
import { applyWinHighlights, clearWinHighlights, clearPaylineOverlay, renderPaylineOverlay } from './reelHighlights';
import type { WinningLine } from './types';

const middleRow: WinningLine = {
  id: 'line-2',
  name: 'Middle Row',
  symbol: '7️⃣',
  amount: 12.5,
  positions: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
};

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

function buildGrid(): { gridEl: HTMLElement; svgEl: SVGSVGElement } {
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
  return { gridEl, svgEl };
}

describe('applyWinHighlights / clearWinHighlights', () => {
  it('AC1: marks every cell in a winning line as is-win', () => {
    const { gridEl } = buildGrid();
    applyWinHighlights(gridEl, [middleRow]);
    expect(gridEl.querySelectorAll('.reel-cell.is-win').length).toBe(5);
  });

  it('AC1: marks cells for every simultaneous winning line', () => {
    const { gridEl } = buildGrid();
    applyWinHighlights(gridEl, [topRow, bottomRow]);
    expect(gridEl.querySelectorAll('.reel-cell.is-win').length).toBe(10);
  });

  it('AC3: applying an empty winning-lines list highlights nothing', () => {
    const { gridEl } = buildGrid();
    applyWinHighlights(gridEl, []);
    expect(gridEl.querySelectorAll('.reel-cell.is-win').length).toBe(0);
  });

  it('AC5: clearWinHighlights removes is-win from every cell', () => {
    const { gridEl } = buildGrid();
    applyWinHighlights(gridEl, [middleRow]);
    clearWinHighlights(gridEl);
    expect(gridEl.querySelectorAll('.reel-cell.is-win').length).toBe(0);
  });
});

describe('renderPaylineOverlay / clearPaylineOverlay', () => {
  it('AC1: traces one polyline per winning line', () => {
    const { svgEl } = buildGrid();
    renderPaylineOverlay(svgEl, [middleRow]);
    expect(svgEl.querySelectorAll('polyline').length).toBe(1);
  });

  it('AC1: marks the second simultaneous line as payline-secondary', () => {
    const { svgEl } = buildGrid();
    renderPaylineOverlay(svgEl, [topRow, bottomRow]);
    const polylines = svgEl.querySelectorAll('polyline');
    expect(polylines.length).toBe(2);
    expect(polylines[0].classList.contains('payline-secondary')).toBe(false);
    expect(polylines[1].classList.contains('payline-secondary')).toBe(true);
  });

  it('AC3: rendering an empty winning-lines list draws no polylines', () => {
    const { svgEl } = buildGrid();
    renderPaylineOverlay(svgEl, []);
    expect(svgEl.querySelectorAll('polyline').length).toBe(0);
  });

  it('AC5: clearPaylineOverlay removes all polylines', () => {
    const { svgEl } = buildGrid();
    renderPaylineOverlay(svgEl, [middleRow]);
    clearPaylineOverlay(svgEl);
    expect(svgEl.querySelectorAll('polyline').length).toBe(0);
  });
});
