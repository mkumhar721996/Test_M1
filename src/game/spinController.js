export class SpinController {
  constructor({ reelCount = 3 } = {}) {
    this.reelCount = reelCount;
    this.reelStates = Array(reelCount).fill('idle');
    this.finalSymbols = Array(reelCount).fill(null);
  }

  async startSpin(requestEngineSpin) {
    this.reelStates = this.reelStates.map(() => 'spinning');

    const payload = await requestEngineSpin();

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
