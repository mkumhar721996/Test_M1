import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReelStrip } from './ReelStrip';

describe('ReelStrip', () => {
  it('pauses reel animation when frozen due to an engine error', () => {
    render(<ReelStrip positions={[12, 34, 56]} status="frozen-error" />);

    expect(screen.getByTestId('reel-0')).toHaveStyle({ animationPlayState: 'paused' });
  });

  it('resumes reel animation when not frozen due to engine error', () => {
    render(<ReelStrip positions={[12, 34, 56]} status="spinning" />);

    expect(screen.getByTestId('reel-0')).not.toHaveStyle({ animationPlayState: 'paused' });
  });

  it('keeps the animation running once a retry is in flight', () => {
    render(<ReelStrip positions={[12, 34, 56]} status="retrying" />);

    expect(screen.getByTestId('reel-0')).not.toHaveStyle({ animationPlayState: 'paused' });
  });
});
