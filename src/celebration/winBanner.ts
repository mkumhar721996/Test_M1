import type { EngineResultPayload } from './types';

export function showWinBanner(bannerEl: HTMLElement, payload: EngineResultPayload): void {
  const chips = payload.winningLines
    .map((line) => `<span class="chip">${line.name} — $${line.amount.toFixed(2)}</span>`)
    .join('');
  bannerEl.innerHTML = `
    <p class="win-label u-text-sm u-text-muted" style="margin:0;">Total Win</p>
    <p class="win-amount">$${payload.totalWin.toFixed(2)}</p>
    <div class="win-lines">${chips}</div>
  `;
  bannerEl.hidden = false;
}

export function hideWinBanner(bannerEl: HTMLElement): void {
  bannerEl.hidden = true;
  bannerEl.innerHTML = '';
}
