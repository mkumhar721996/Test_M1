import { Wallet } from '../wallet/wallet.ts';
import type { GameEngine, GameEngineResult } from './gameEngine.ts';

export class SpinService {
  private wallet: Wallet;
  private engine: GameEngine;

  constructor(wallet: Wallet, engine: GameEngine) {
    this.wallet = wallet;
    this.engine = engine;
  }

  async spin(bet: number): Promise<GameEngineResult> {
    this.wallet.deduct(bet);
    const result = await this.engine.spin(bet);
    if (!result.success) {
      this.wallet.credit(bet);
    }
    return result;
  }
}
