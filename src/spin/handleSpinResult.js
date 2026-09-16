import { creditWinnings } from '../wallet/creditWinnings.js';
import { updateBalanceDisplay } from '../ui/balanceDisplay.js';

export function handleSpinResult({ postDeductionBalance, winningAmount, balanceContainer, spinButton }) {
  const newBalance = creditWinnings(postDeductionBalance, winningAmount);
  updateBalanceDisplay(balanceContainer, newBalance);
  spinButton.disabled = false;
  return newBalance;
}
