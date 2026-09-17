import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner', () => {
  it('offers both a Retry and a Reload action', () => {
    render(<ErrorBanner message="Spin failed." onRetry={vi.fn()} onReload={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('calls onRetry when Retry is selected', () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Spin failed." onRetry={onRetry} onReload={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalled();
  });

  it('reloads the page when Reload is selected', () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, writable: true });

    render(<ErrorBanner message="x" onRetry={vi.fn()} onReload={() => window.location.reload()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reloadSpy).toHaveBeenCalled();
  });

  it('announces the error message and actions to screen readers', () => {
    render(<ErrorBanner message="Spin failed." onRetry={vi.fn()} onReload={vi.fn()} />);

    const region = screen.getByRole('alert');
    expect(region).toHaveAttribute('aria-live', 'assertive');
    expect(region).toHaveTextContent('Spin failed.');
    expect(region).toContainElement(screen.getByRole('button', { name: 'Retry' }));
    expect(region).toContainElement(screen.getByRole('button', { name: 'Reload' }));
  });
});
