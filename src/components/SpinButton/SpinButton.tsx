import type { DisabledReason } from '../../game-controls/useGameControls';

export interface SpinButtonProps {
  disabledReason: DisabledReason;
  onSpin: () => void;
}

const INSUFFICIENT_BALANCE_MESSAGE = 'Insufficient balance';
const DESCRIPTION_ID = 'spin-button-insufficient-balance';

export function SpinButton({ disabledReason, onSpin }: SpinButtonProps) {
  const isDisabled = disabledReason !== null;
  const isInsufficientBalance = disabledReason === 'insufficient-balance';

  return (
    <>
      <button
        type="button"
        className={`btn btn-primary${isDisabled ? ' btn-disabled' : ''}`}
        aria-disabled={isDisabled}
        aria-describedby={isInsufficientBalance ? DESCRIPTION_ID : undefined}
        title={isInsufficientBalance ? INSUFFICIENT_BALANCE_MESSAGE : undefined}
        onClick={() => {
          if (!isDisabled) {
            onSpin();
          }
        }}
      >
        Spin
      </button>
      {isInsufficientBalance && (
        <span id={DESCRIPTION_ID} className="u-visually-hidden">
          {INSUFFICIENT_BALANCE_MESSAGE}
        </span>
      )}
    </>
  );
}
