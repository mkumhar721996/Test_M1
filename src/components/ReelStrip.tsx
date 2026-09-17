import type { SpinStatus } from '../state/spinMachine';
import './reel.css';

export interface ReelStripProps {
  positions: number[];
  status: SpinStatus;
}

export function ReelStrip({ positions, status }: ReelStripProps): JSX.Element {
  const animationPlayState = status === 'frozen-error' ? 'paused' : 'running';

  return (
    <div className="reel-strip">
      {positions.map((position, index) => (
        <div key={index} className="reel" data-testid={`reel-${index}`} style={{ animationPlayState }}>
          {position}
        </div>
      ))}
    </div>
  );
}
