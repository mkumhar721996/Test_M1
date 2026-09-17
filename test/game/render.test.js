import { describe, it, expect } from 'vitest';
import { renderGrid } from '../../src/game/render.js';

describe('renderGrid while spinning', () => {
  it('applies the reel--spinning class to every reel element', () => {
    document.body.innerHTML = '<div id="grid"></div>';
    const container = document.getElementById('grid');

    renderGrid(container, { reelStates: ['spinning', 'spinning', 'spinning'], finalSymbols: [null, null, null] });

    const reelEls = [...container.querySelectorAll('[data-reel]')];
    expect(reelEls.every((el) => el.classList.contains('reel--spinning'))).toBe(true);
  });
});

describe('renderGrid once stopped', () => {
  it('renders a symbol grid that exactly matches the payload positions after reels stop', () => {
    document.body.innerHTML = '<div id="grid"></div>';
    const container = document.getElementById('grid');
    const finalSymbols = [
      ['CHERRY', 'BAR', 'SEVEN'],
      ['BELL', 'CHERRY', 'BAR'],
      ['SEVEN', 'SEVEN', 'BAR'],
    ];

    renderGrid(container, { reelStates: ['stopped', 'stopped', 'stopped'], finalSymbols });

    const cells = [...container.querySelectorAll('[data-reel][data-row]')];
    const rendered = cells.map((el) => el.dataset.symbol);
    expect(rendered).toEqual([
      'CHERRY', 'BAR', 'SEVEN',
      'BELL', 'CHERRY', 'BAR',
      'SEVEN', 'SEVEN', 'BAR',
    ]);
    expect(container.querySelector('.reel--spinning')).toBeNull();
  });
});
