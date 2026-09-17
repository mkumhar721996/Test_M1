import { createGameState } from './state/gameState.js';
import { createBetState } from './state/betState.js';
import { createPaytableController } from './components/paytable/Paytable.js';
import { createPaytableControl } from './components/paytableControl/PaytableControl.js';

const engineConfig = {
  symbols: [
    { id: 'seven', name: 'Seven', payoutPerLine: { 3: 50, 4: 200, 5: 1000 } },
    { id: 'bell', name: 'Bell', payoutPerLine: { 3: 20, 4: 80, 5: 300 } },
    { id: 'bar', name: 'Bar', payoutPerLine: { 3: 10, 4: 40, 5: 150 } },
    { id: 'cherry', name: 'Cherry', payoutPerLine: { 3: 5, 4: 15, 5: 50 } },
  ],
  paylines: [
    { id: 'line-1', positions: [1, 1, 1, 1, 1], description: 'Middle row, straight across all five reels' },
    { id: 'line-2', positions: [0, 0, 0, 0, 0], description: 'Top row, straight across all five reels' },
    { id: 'line-3', positions: [2, 2, 2, 2, 2], description: 'Bottom row, straight across all five reels' },
    { id: 'line-4', positions: [0, 1, 2, 1, 0], description: 'V shape starting top-left, dipping to bottom-middle' },
    { id: 'line-5', positions: [2, 1, 0, 1, 2], description: 'Inverted V shape starting bottom-left, rising to top-middle' },
  ],
};

const gameState = createGameState('idle');
const betState = createBetState([0.1, 0.25, 0.5, 1, 2]);

const app = document.getElementById('app');
const mountPoint = document.getElementById('paytable-mount');

const controller = createPaytableController({ config: engineConfig, gameState, betState, mountPoint });
const control = createPaytableControl({
  gameState,
  onOpen: (trigger) => controller.open(trigger),
});

app.appendChild(control);
