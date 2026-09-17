import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BetSelector } from './BetSelector';

describe('BetSelector', () => {
  it('only lists bet amounts the wallet can afford', () => {
    render(
      <BetSelector
        betOptions={[10, 25, 50, 100]}
        walletBalance={40}
        selectedBet={10}
        disabled={false}
        onChange={vi.fn()}
      />
    );
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['10', '25']);
  });

  it('calls onChange with the numeric bet amount when selection changes', () => {
    const onChange = vi.fn();
    render(
      <BetSelector
        betOptions={[10, 25]}
        walletBalance={100}
        selectedBet={10}
        disabled={false}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText('Bet amount'), { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledWith(25);
  });

  it('disables the selector when requested', () => {
    render(
      <BetSelector
        betOptions={[10, 25]}
        walletBalance={100}
        selectedBet={10}
        disabled
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Bet amount')).toBeDisabled();
  });
});
