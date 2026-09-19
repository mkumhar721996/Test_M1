import { describe, it, expect } from 'vitest';
import { SpinController } from '../../src/game/spinController.js';

describe('SpinController.startSpin', () => {
  it('sets every reel to spinning synchronously, before the engine promise resolves', () => {
    const controller = new SpinController({ reelCount: 3 });
    const neverResolves = new Promise(() => {});

    controller.startSpin(() => neverResolves);

    expect(controller.getReelStates()).toEqual(['spinning', 'spinning', 'spinning']);
  });

  it('stops each reel on the exact symbols from the engine result payload', async () => {
    const payload = {
      reels: [
        { symbols: ['CHERRY', 'BAR', 'SEVEN'] },
        { symbols: ['BELL', 'CHERRY', 'BAR'] },
        { symbols: ['SEVEN', 'SEVEN', 'BAR'] },
      ],
    };
    const controller = new SpinController({ reelCount: 3 });

    await controller.startSpin(() => Promise.resolve(payload));

    expect(controller.getReelStates()).toEqual(['stopped', 'stopped', 'stopped']);
    expect(controller.getFinalSymbols()).toEqual([
      ['CHERRY', 'BAR', 'SEVEN'],
      ['BELL', 'CHERRY', 'BAR'],
      ['SEVEN', 'SEVEN', 'BAR'],
    ]);
  });

  it('resets reels to idle and rethrows when the engine call rejects', async () => {
    const controller = new SpinController({ reelCount: 3 });
    const engineError = new Error('engine unreachable');

    await expect(controller.startSpin(() => Promise.reject(engineError))).rejects.toThrow(
      'engine unreachable'
    );

    expect(controller.getReelStates()).toEqual(['idle', 'idle', 'idle']);
  });

  it('resets reels to idle and throws when the payload has no reels array', async () => {
    const controller = new SpinController({ reelCount: 3 });

    await expect(controller.startSpin(() => Promise.resolve({}))).rejects.toThrow();

    expect(controller.getReelStates()).toEqual(['idle', 'idle', 'idle']);
  });
});
