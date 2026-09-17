import { SpinControls } from './components/SpinControls/SpinControls';

const WALLET_BALANCE = 100;
const BET_OPTIONS = [10, 25, 50, 100];
const INITIAL_BET = 10;

export function App() {
  return (
    <main className="u-p-4">
      <SpinControls
        walletBalance={WALLET_BALANCE}
        betOptions={BET_OPTIONS}
        initialBet={INITIAL_BET}
        onSpinRequested={() => {}}
      />
    </main>
  );
}
