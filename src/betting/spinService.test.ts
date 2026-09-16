import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from '../wallet/wallet.ts';
import type { GameEngine, GameEngineResult } from './gameEngine.ts';
import { SpinService } from './spinService.ts';

test('credits the deducted bet back to balance when engine errors', async () => {
  const wallet = new Wallet(100);
  const engine: GameEngine = {
    spin: async (): Promise<GameEngineResult> => ({ success: false, error: 'ENGINE_TIMEOUT' }),
  };
  const spinService = new SpinService(wallet, engine);

  await spinService.spin(10);

  assert.equal(wallet.balance, 100);
});

test('restores balance to exactly its pre-spin value after a refund', async () => {
  const wallet = new Wallet(37.5);
  const balanceBeforeSpin = wallet.balance;
  const engine: GameEngine = {
    spin: async (): Promise<GameEngineResult> => ({ success: false, error: 'ENGINE_DOWN' }),
  };
  const spinService = new SpinService(wallet, engine);

  await spinService.spin(12.5);

  assert.equal(wallet.balance, balanceBeforeSpin);
});

test('does not credit the bet back when the engine succeeds', async () => {
  const wallet = new Wallet(100);
  const engine: GameEngine = {
    spin: async (): Promise<GameEngineResult> => ({ success: true, payout: 0, outcome: {} }),
  };
  const spinService = new SpinService(wallet, engine);

  await spinService.spin(10);

  assert.equal(wallet.balance, 90);
});
