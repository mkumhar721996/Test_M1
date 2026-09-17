export class SpinController {
  constructor({ reelCount = 3 } = {}) {
    this.reelCount = reelCount;
    this.reelStates = Array(reelCount).fill('idle');
    this.finalSymbols = Array(reelCount).fill(null);
  }

  async startSpin(requestEngineSpin) {
    this.reelStates = this.reelStates.map(() => 'spinning');

    let payload;
    try {
      payload = await requestEngineSpin();
    } catch (err) {
      this.reelStates = this.reelStates.map(() => 'idle');
      throw err;
    }

    if (!payload || !Array.isArray(payload.reels) || payload.reels.length !== this.reelCount) {
      this.reelStates = this.reelStates.map(() => 'idle');
      throw new Error(
        `Invalid engine spin payload: expected { reels: [{ symbols }, ...] } with ${this.reelCount} reels`
      );
    }

    this.finalSymbols = payload.reels.map((reel) => reel.symbols);
    this.reelStates = this.reelStates.map(() => 'stopped');
  }

  getReelStates() {
    return this.reelStates;
  }

  getFinalSymbols() {
    return this.finalSymbols;
  }
}
