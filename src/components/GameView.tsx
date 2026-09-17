import type { EngineClient } from '../engine/engineClient';
import { useSpinController } from '../state/useSpinController';
import { ReelStrip } from './ReelStrip';
import { ErrorBanner } from './ErrorBanner';

export interface GameViewProps {
  engineClient: EngineClient;
}

const DEFAULT_REEL_POSITIONS = [0, 0, 0];

export function GameView({ engineClient }: GameViewProps): JSX.Element {
  const { state, spin, retry, reload } = useSpinController(engineClient);
  const isSpinning = state.status === 'spinning' || state.status === 'retrying';
  const positions = state.reelPositions.length > 0 ? state.reelPositions : DEFAULT_REEL_POSITIONS;

  return (
    <div className="u-stack">
      <ReelStrip positions={positions} status={state.status} />
      <button type="button" className="btn btn-primary" onClick={() => spin()} disabled={isSpinning}>
        Spin
      </button>
      {state.status === 'frozen-error' && state.errorMessage && (
        <ErrorBanner message={state.errorMessage} onRetry={() => retry()} onReload={reload} />
      )}
    </div>
  );
}
