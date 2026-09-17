import type { CelebrationStore } from './celebrationStore';
import { applyWinHighlights, clearPaylineOverlay, clearWinHighlights, renderPaylineOverlay } from './reelHighlights';
import type { EngineResultPayload } from './types';
import { hideWinBanner, showWinBanner } from './winBanner';

export interface CelebrationDom {
  gridEl: HTMLElement;
  svgEl: SVGSVGElement;
  bannerEl: HTMLElement;
}

export interface CelebrationController {
  onResult(payload: EngineResultPayload): void;
  onNewSpin(): void;
}

export function attachCelebration(store: CelebrationStore, dom: CelebrationDom): CelebrationController {
  const { gridEl, svgEl, bannerEl } = dom;

  return {
    onResult(payload: EngineResultPayload) {
      store.settle(payload);
      clearWinHighlights(gridEl);
      clearPaylineOverlay(svgEl);
      if (store.getState() === 'celebrating') {
        applyWinHighlights(gridEl, store.getWinningLines());
        renderPaylineOverlay(svgEl, store.getWinningLines());
        showWinBanner(bannerEl, { winningLines: store.getWinningLines(), totalWin: store.getTotalWin() });
      } else {
        hideWinBanner(bannerEl);
      }
    },
    onNewSpin() {
      store.startNewSpin();
      clearWinHighlights(gridEl);
      clearPaylineOverlay(svgEl);
      hideWinBanner(bannerEl);
    },
  };
}
