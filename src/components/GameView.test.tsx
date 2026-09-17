import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameView } from './GameView';
import type { EngineClient } from '../engine/engineClient';

describe('GameView', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows an inline error message inside the game view when the engine errors', async () => {
    const engineClient: EngineClient = {
      requestSpin: vi.fn().mockRejectedValue(new Error('boom')),
      retrySpin: vi.fn(),
    };

    render(<GameView engineClient={engineClient} />);
    fireEvent.click(screen.getByRole('button', { name: /spin/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
  });

  it('resumes and completes the spin when Retry succeeds after an engine error', async () => {
    const result = { spinId: 'spin-1', reelPositions: [1, 2, 3], winAmount: 5 };
    const engineClient: EngineClient = {
      requestSpin: vi.fn().mockRejectedValue(new Error('boom')),
      retrySpin: vi.fn().mockResolvedValue(result),
    };

    render(<GameView engineClient={engineClient} />);
    fireEvent.click(screen.getByRole('button', { name: /spin/i }));
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByText('1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
