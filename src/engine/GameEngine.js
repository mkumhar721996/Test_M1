import { GAME_CONFIG } from '../config/index.js';
import { validateConfig } from './validateConfig.js';

export class GameEngine {
  constructor(config = GAME_CONFIG) {
    validateConfig(config);
    this.config = config;
  }

  getConfig() {
    return this.config;
  }
}
