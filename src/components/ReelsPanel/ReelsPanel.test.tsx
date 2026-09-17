import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReelsPanel } from './ReelsPanel';

describe('ReelsPanel', () => {
  it('marks the reels inert while a spin is in-flight', () => {
    render(<ReelsPanel locked />);
    const panel = screen.getByTestId('reels-panel');
    expect(panel).toHaveAttribute('inert', '');
    expect(panel).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not mark the reels inert when idle', () => {
    render(<ReelsPanel locked={false} />);
    const panel = screen.getByTestId('reels-panel');
    expect(panel).not.toHaveAttribute('inert');
    expect(panel).toHaveAttribute('aria-disabled', 'false');
  });
});
