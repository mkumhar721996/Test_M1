import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { GameApp } from '../../src/ui/GameApp';
import { createInitialSession } from '../../src/session/gameSession';

describe('GameApp', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('shows Play Again once the balance hits zero', () => {
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
    app.applySpinResult(-10);
    expect(root.querySelector<HTMLElement>('#playAgainWrap')!.hidden).toBe(false);
  });

  it('disables the spin controls once the balance hits zero', () => {
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
    app.applySpinResult(-10);
    expect(root.querySelector<HTMLButtonElement>('#spinBtn')!.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('#betDownBtn')!.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('#betUpBtn')!.disabled).toBe(true);
  });

  it('does not show Play Again when balance settles exactly at the minimum bet', () => {
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 20 } });
    app.applySpinResult(-10);
    expect(root.querySelector<HTMLElement>('#playAgainWrap')!.hidden).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('#spinBtn')!.disabled).toBe(false);
  });

  it('resets balance to 1000 credits on activation', () => {
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
    app.applySpinResult(-10);
    fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
    expect(app.getState().balance).toBe(1000);
  });

  it('re-enables the spin controls on activation', () => {
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
    app.applySpinResult(-10);
    fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
    expect(root.querySelector<HTMLButtonElement>('#spinBtn')!.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('#betDownBtn')!.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('#betUpBtn')!.disabled).toBe(false);
  });

  it('does not trigger a page reload on activation', () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
    app.applySpinResult(-10);
    fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('keeps the same canvas-panel DOM node across a bust-and-recover cycle', () => {
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
    const panelBefore = root.querySelector('.canvas-panel');
    app.applySpinResult(-10);
    fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
    expect(root.querySelector('.canvas-panel')).toBe(panelBefore);
  });

  it('moves focus to Play Again the moment it appears', () => {
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
    app.applySpinResult(-10);
    expect(document.activeElement).toBe(root.querySelector('#playAgainBtn'));
  });

  it('announces the balance reset and controls re-enable together', () => {
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
    app.applySpinResult(-10);
    fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
    const liveRegion = root.querySelector('#liveRegion')!;
    expect(liveRegion.getAttribute('role')).toBe('status');
    expect(liveRegion.textContent).toMatch(/balance reset to 1,000 credits/i);
    expect(liveRegion.textContent).toMatch(/spin controls re-enabled/i);
  });

  it('resets last bet, spin history, and win total to defaults on activation', () => {
    const seeded = { balance: 10, bet: 10, lastBet: 10, winTotal: 185, spinHistory: [25, -10, -10, 40, -10] };
    const app = new GameApp(root, { initialState: seeded });
    app.applySpinResult(-10);
    fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
    const state = app.getState();
    expect(state.lastBet).toBeNull();
    expect(state.winTotal).toBe(0);
    expect(state.spinHistory).toEqual([]);
  });

  it('disables the button before the reset function runs', () => {
    let btn: HTMLButtonElement;
    const resetSpy = vi.fn(() => {
      expect(btn.disabled).toBe(true);
      return createInitialSession();
    });
    const app = new GameApp(root, {
      initialState: { ...createInitialSession(), balance: 10 },
      resetSession: resetSpy,
    });
    app.applySpinResult(-10);
    btn = root.querySelector<HTMLButtonElement>('#playAgainBtn')!;
    fireEvent.click(btn);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores a second activation while the button is already disabled', () => {
    const resetSpy = vi.fn(createInitialSession);
    const app = new GameApp(root, {
      initialState: { ...createInitialSession(), balance: 10 },
      resetSession: resetSpy,
    });
    app.applySpinResult(-10);
    const btn = root.querySelector<HTMLButtonElement>('#playAgainBtn')!;
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });
});
