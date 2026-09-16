export class Wallet {
  private _balance: number;

  constructor(initialBalance: number) {
    this._balance = initialBalance;
  }

  get balance(): number {
    return this._balance;
  }

  deduct(amount: number): void {
    this._balance -= amount;
  }

  credit(amount: number): void {
    this._balance += amount;
  }
}
