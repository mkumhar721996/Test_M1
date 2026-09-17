import { useGameControls } from '../../game-controls/useGameControls';
import { BetSelector } from '../BetSelector/BetSelector';
import { SpinButton } from '../SpinButton/SpinButton';
import { ReelsPanel } from '../ReelsPanel/ReelsPanel';

export interface SpinControlsProps {
  walletBalance: number;
  betOptions: number[];
  initialBet: number;
  onSpinRequested: () => void;
}

export function SpinControls({
  walletBalance,
  betOptions,
  initialBet,
  onSpinRequested,
}: SpinControlsProps) {
  const { state, actions } = useGameControls({ walletBalance, betOptions, initialBet });

  return (
    <div className="u-stack u-p-4">
      <ReelsPanel locked={state.reelsLocked} />
      <div className="u-stack u-gap-3 u-p-2" style={{ display: 'flex', flexWrap: 'wrap' }}>
        <BetSelector
          betOptions={betOptions}
          walletBalance={walletBalance}
          selectedBet={state.betAmount}
          disabled={state.reelsLocked}
          onChange={actions.setBetAmount}
        />
        <SpinButton
          disabledReason={state.disabledReason}
          onSpin={() => {
            actions.startSpin();
            onSpinRequested();
          }}
        />
      </div>
    </div>
  );
}
