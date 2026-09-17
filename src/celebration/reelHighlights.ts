import type { WinningLine } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CELL = 64;
const GAP = 8;
const PAD = 16;

function cellCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: PAD + col * (CELL + GAP) + CELL / 2,
    y: PAD + row * (CELL + GAP) + CELL / 2,
  };
}

export function applyWinHighlights(gridEl: HTMLElement, winningLines: WinningLine[]): void {
  winningLines.forEach((line) => {
    line.positions.forEach(([col, row]) => {
      const cell = gridEl.querySelector(`.reel-cell[data-col="${col}"][data-row="${row}"]`);
      cell?.classList.add('is-win');
    });
  });
}

export function clearWinHighlights(gridEl: HTMLElement): void {
  gridEl.querySelectorAll('.reel-cell.is-win').forEach((cell) => cell.classList.remove('is-win'));
}

export function renderPaylineOverlay(svgEl: SVGSVGElement, winningLines: WinningLine[]): void {
  winningLines.forEach((line, idx) => {
    const points = line.positions
      .map(([col, row]) => {
        const { x, y } = cellCenter(col, row);
        return `${x},${y}`;
      })
      .join(' ');
    const polyline = document.createElementNS(SVG_NS, 'polyline');
    polyline.setAttribute('points', points);
    if (idx > 0) polyline.classList.add('payline-secondary');
    svgEl.appendChild(polyline);
  });
}

export function clearPaylineOverlay(svgEl: SVGSVGElement): void {
  svgEl.innerHTML = '';
}
