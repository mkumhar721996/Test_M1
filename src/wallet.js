export const STARTING_BALANCE = 1000;

export function createWallet(startingBalance = STARTING_BALANCE) {
  return { balance: startingBalance };
}

export function placeBet(wallet, amount) {
  if (amount <= 0 || amount > wallet.balance) {
    throw new Error('Invalid bet amount');
  }
  return { balance: wallet.balance - amount };
}
