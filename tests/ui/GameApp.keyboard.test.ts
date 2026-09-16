import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { GameApp } from '../../src/ui/GameApp';
import { createInitialSession } from '../../src/session/gameSession';

describe('GameApp keyboard activation', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('activates Play Again via Enter once focused', async () => {
    const user = userEvent.setup();
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
    app.applySpinResult(-10);
    const btn = root.querySelector<HTMLButtonElement>('#playAgainBtn')!;
    expect(document.activeElement).toBe(btn);
    await user.keyboard('{Enter}');
    expect(app.getState().balance).toBe(1000);
  });

  it('activates Play Again via Space once focused', async () => {
    const user = userEvent.setup();
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
    app.applySpinResult(-10);
    root.querySelector<HTMLButtonElement>('#playAgainBtn')!.focus();
    await user.keyboard(' ');
    expect(app.getState().balance).toBe(1000);
  });

  it('is reachable via Tab from the preceding focusable control', async () => {
    const user = userEvent.setup();
    const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
    app.applySpinResult(-10);
    const btn = root.querySelector<HTMLButtonElement>('#playAgainBtn')!;
    (document.body as HTMLElement).focus();
    btn.blur();
    await user.tab();
    expect(document.activeElement).toBe(btn);
  });
});
