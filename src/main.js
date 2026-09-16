import { BetSelector } from './betting/bet-selector.js';
import { renderBetSelector } from './ui/bet-selector-view.js';

// Placeholder until a real wallet module (Player Wallet & Betting epic) exists.
const PLACEHOLDER_BALANCE = 1000;

const container = document.getElementById('bet-selector');
const selector = new BetSelector(PLACEHOLDER_BALANCE);
renderBetSelector(container, selector);
