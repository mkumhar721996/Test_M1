export interface BetSelectorProps {
  betOptions: number[];
  walletBalance: number;
  selectedBet: number;
  disabled: boolean;
  onChange: (bet: number) => void;
}

export function BetSelector({
  betOptions,
  walletBalance,
  selectedBet,
  disabled,
  onChange,
}: BetSelectorProps) {
  const affordableOptions = betOptions.filter((amount) => amount <= walletBalance);

  return (
    <div>
      <label className="label" htmlFor="bet-amount">
        Bet amount
      </label>
      <select
        id="bet-amount"
        className="input"
        value={selectedBet}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {affordableOptions.map((amount) => (
          <option key={amount} value={amount}>
            {amount}
          </option>
        ))}
      </select>
    </div>
  );
}
