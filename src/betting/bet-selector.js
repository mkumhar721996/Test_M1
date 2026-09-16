export const BET_LEVELS = [10, 20, 50, 100];

export class BetSelector {
  constructor(balance) {
    this.balance = balance;
    this.spinInProgress = false;
    this.activeBet = BET_LEVELS[0];
  }

  isDisabled(level) {
    return this.spinInProgress || level > this.balance;
  }

  select(level) {
    if (this.isDisabled(level)) {
      return false;
    }
    this.activeBet = level;
    return true;
  }

  setBalance(balance) {
    this.balance = balance;
  }

  setSpinInProgress(inProgress) {
    this.spinInProgress = inProgress;
  }
}
