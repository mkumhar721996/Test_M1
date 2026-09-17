import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { SpinButton } from './SpinButton';

describe('SpinButton', () => {
  it('enables spin when idle and the bet is affordable', () => {
    const onSpin = vi.fn();
    render(<SpinButton disabledReason={null} onSpin={onSpin} />);
    const button = screen.getByRole('button', { name: /spin/i });
    expect(button).toHaveAttribute('aria-disabled', 'false');
    expect(button).not.toHaveClass('btn-disabled');
    fireEvent.click(button);
    expect(onSpin).toHaveBeenCalledTimes(1);
  });

  it('visually disables the spin button when balance is insufficient', () => {
    render(<SpinButton disabledReason="insufficient-balance" onSpin={vi.fn()} />);
    const button = screen.getByRole('button', { name: /spin/i });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveClass('btn-disabled');
  });

  it('shows an "Insufficient balance" tooltip when disabled for balance reasons', () => {
    render(<SpinButton disabledReason="insufficient-balance" onSpin={vi.fn()} />);
    const button = screen.getByRole('button', { name: /spin/i });
    expect(button).toHaveAttribute('title', 'Insufficient balance');
    expect(screen.getByText('Insufficient balance')).toBeInTheDocument();
  });

  it('ignores clicks while a spin is in-flight', () => {
    const onSpin = vi.fn();
    render(<SpinButton disabledReason="in-flight" onSpin={onSpin} />);
    const button = screen.getByRole('button', { name: /spin/i });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(onSpin).not.toHaveBeenCalled();
  });

  it('exposes the disabled state and reason to assistive tech', async () => {
    render(<SpinButton disabledReason="insufficient-balance" onSpin={vi.fn()} />);
    const button = screen.getByRole('button', { name: /spin/i });
    const describedById = button.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();
    expect(document.getElementById(describedById!)).toHaveTextContent('Insufficient balance');
    expect(await axe(button.ownerDocument.body)).toHaveNoViolations();
  });
});
