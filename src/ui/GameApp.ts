import {
  createInitialSession,
  applySpinResult as applySpinResultToSession,
  isBelowMinBet,
  type SessionState,
} from '../session/gameSession';

const REEL_SYMBOLS = ['🍒', '🔔', '⭐', '7️⃣', '💎', '🍋', '🍒', '⭐', '🔔'];

const PLAY_AGAIN_ANNOUNCEMENT = 'Balance reset to 1,000 credits. Spin controls re-enabled.';

export interface GameAppOptions {
  initialState?: SessionState;
  resetSession?: () => SessionState;
}

export class GameApp {
  private state: SessionState;
  private readonly resetSession: () => SessionState;

  private readonly liveRegion: HTMLElement;
  private readonly playAgainWrap: HTMLElement;
  private readonly playAgainBtn: HTMLButtonElement;
  private readonly spinBtn: HTMLButtonElement;
  private readonly betDownBtn: HTMLButtonElement;
  private readonly betUpBtn: HTMLButtonElement;
  private readonly balanceValue: HTMLElement;
  private readonly betValue: HTMLElement;
  private readonly lastBetValue: HTMLElement;
  private readonly winTotalValue: HTMLElement;
  private readonly historyChips: HTMLElement;

  constructor(root: HTMLElement, options: GameAppOptions = {}) {
    this.state = options.initialState ?? createInitialSession();
    this.resetSession = options.resetSession ?? createInitialSession;

    root.innerHTML = `
      <div class="game-layout">
        <div class="card canvas-panel">
          <span class="canvas-session-badge">Canvas instance #A93F1</span>
          <div class="reel-grid" aria-hidden="true">
            ${REEL_SYMBOLS.map((symbol) => `<div class="reel-cell">${symbol}</div>`).join('')}
          </div>
          <div class="status-banner" id="liveRegion" role="status" aria-live="polite"></div>
          <div class="play-again-wrap" id="playAgainWrap" hidden>
            <p>Your balance has reached 0 credits.</p>
            <button type="button" class="btn btn-primary btn-play-again" id="playAgainBtn">Play Again</button>
          </div>
          <div class="spin-controls">
            <button type="button" class="btn btn-secondary" id="betDownBtn">Bet −</button>
            <button type="button" class="btn btn-primary" id="spinBtn">Spin</button>
            <button type="button" class="btn btn-secondary" id="betUpBtn">Bet +</button>
          </div>
        </div>

        <div class="card">
          <h2 class="card-title">Session Stats</h2>
          <ul class="stat-list">
            <li class="stat-row"><span class="stat-label">Balance</span><span class="stat-value" id="balanceValue"></span></li>
            <li class="stat-row"><span class="stat-label">Current Bet</span><span class="stat-value" id="betValue"></span></li>
            <li class="stat-row"><span class="stat-label">Last Bet</span><span class="stat-value" id="lastBetValue"></span></li>
            <li class="stat-row"><span class="stat-label">Win Total</span><span class="stat-value" id="winTotalValue"></span></li>
            <li class="stat-row"><span class="stat-label">Spin History</span>
              <span class="history-chips" id="historyChips"></span>
            </li>
          </ul>
        </div>
      </div>
    `;

    this.liveRegion = root.querySelector('#liveRegion')!;
    this.playAgainWrap = root.querySelector('#playAgainWrap')!;
    this.playAgainBtn = root.querySelector('#playAgainBtn')!;
    this.spinBtn = root.querySelector('#spinBtn')!;
    this.betDownBtn = root.querySelector('#betDownBtn')!;
    this.betUpBtn = root.querySelector('#betUpBtn')!;
    this.balanceValue = root.querySelector('#balanceValue')!;
    this.betValue = root.querySelector('#betValue')!;
    this.lastBetValue = root.querySelector('#lastBetValue')!;
    this.winTotalValue = root.querySelector('#winTotalValue')!;
    this.historyChips = root.querySelector('#historyChips')!;

    this.playAgainBtn.addEventListener('click', () => this.handlePlayAgain());

    this.render();
    this.syncRecoveryUi();
  }

  applySpinResult(netDelta: number): void {
    this.state = applySpinResultToSession(this.state, netDelta);
    this.render();
    this.syncRecoveryUi();
  }

  getState(): SessionState {
    return this.state;
  }

  private handlePlayAgain(): void {
    if (this.playAgainBtn.disabled) return;
    this.playAgainBtn.disabled = true;

    this.state = this.resetSession();
    this.render();

    this.playAgainWrap.hidden = true;
    this.setControlsEnabled(true);
    this.liveRegion.textContent = PLAY_AGAIN_ANNOUNCEMENT;
    this.spinBtn.focus();
  }

  private syncRecoveryUi(): void {
    if (isBelowMinBet(this.state)) {
      this.playAgainWrap.hidden = false;
      this.playAgainBtn.disabled = false;
      this.setControlsEnabled(false);
      this.playAgainBtn.focus();
    } else {
      this.playAgainWrap.hidden = true;
      this.setControlsEnabled(true);
    }
  }

  private setControlsEnabled(enabled: boolean): void {
    this.spinBtn.disabled = !enabled;
    this.betDownBtn.disabled = !enabled;
    this.betUpBtn.disabled = !enabled;
  }

  private render(): void {
    this.balanceValue.textContent = `${this.state.balance} credits`;
    this.betValue.textContent = `${this.state.bet} credits`;
    this.lastBetValue.textContent =
      this.state.lastBet === null ? '—' : `${this.state.lastBet} credits`;
    this.winTotalValue.textContent = `${this.state.winTotal} credits`;
    this.spinBtn.textContent = `Spin (bet ${this.state.bet})`;
    this.historyChips.innerHTML = this.state.spinHistory.length
      ? this.state.spinHistory
          .map((entry) => `<span class="chip">${entry >= 0 ? '+' : ''}${entry}</span>`)
          .join('')
      : '<span class="chip">No spins recorded yet</span>';
  }
}
