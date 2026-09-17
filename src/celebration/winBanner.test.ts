import { describe, expect, it } from 'vitest';
import { hideWinBanner, showWinBanner } from './winBanner';
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

function buildBanner(): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'win-banner';
  banner.hidden = true;
  return banner;
}

describe('showWinBanner', () => {
  it('AC2: unhides the banner and displays the formatted total win amount', () => {
    const banner = buildBanner();
    showWinBanner(banner, { winningLines: [middleRow], totalWin: 12.5 });
    expect(banner.hidden).toBe(false);
    expect(banner.querySelector('.win-amount')?.textContent).toBe('$12.50');
  });

  it('AC2: renders one chip per winning line with name and amount', () => {
    const banner = buildBanner();
    showWinBanner(banner, { winningLines: [topRow, bottomRow], totalWin: 20.0 });
    const chips = banner.querySelectorAll('.win-lines .chip');
    expect(chips.length).toBe(2);
    expect(chips[0].textContent).toBe('Top Row — $5.00');
    expect(chips[1].textContent).toBe('Bottom Row — $15.00');
    expect(banner.querySelector('.win-amount')?.textContent).toBe('$20.00');
  });
});

describe('hideWinBanner', () => {
  it('AC4: hides the banner and clears its content', () => {
    const banner = buildBanner();
    showWinBanner(banner, { winningLines: [middleRow], totalWin: 12.5 });
    hideWinBanner(banner);
    expect(banner.hidden).toBe(true);
    expect(banner.innerHTML).toBe('');
  });
});
