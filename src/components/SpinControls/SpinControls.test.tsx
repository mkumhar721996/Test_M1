import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpinControls } from './SpinControls';

describe('SpinControls', () => {
  it('keeps the spin button enabled and hides the tooltip after selecting an affordable bet', async () => {
    const user = userEvent.setup();
    render(
      <SpinControls
        walletBalance={50}
        betOptions={[10, 25, 50]}
        initialBet={10}
        onSpinRequested={vi.fn()}
      />
    );
    await user.selectOptions(screen.getByLabelText('Bet amount'), '50');
    expect(screen.getByRole('button', { name: /spin/i })).toHaveAttribute('aria-disabled', 'false');
    expect(screen.queryByText('Insufficient balance')).not.toBeInTheDocument();
  });

  it('disables the spin button and shows the tooltip when the bet exceeds the balance', () => {
    render(
      <SpinControls
        walletBalance={40}
        betOptions={[10, 25, 50]}
        initialBet={50}
        onSpinRequested={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /spin/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Insufficient balance')).toBeInTheDocument();
  });

  it('is fully operable via keyboard alone', async () => {
    const user = userEvent.setup();
    const onSpinRequested = vi.fn();
    render(
      <SpinControls
        walletBalance={100}
        betOptions={[10, 25, 50]}
        initialBet={10}
        onSpinRequested={onSpinRequested}
      />
    );
    await user.tab();
    expect(screen.getByLabelText('Bet amount')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /spin/i })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSpinRequested).toHaveBeenCalledTimes(1);
  });
});
