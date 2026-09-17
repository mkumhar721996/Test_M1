import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFetchEngineClient } from './engineClient';

describe('createFetchEngineClient', () => {
  const baseUrl = 'https://engine.example.test';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with the spin result when the engine request succeeds', async () => {
    const result = { spinId: 'spin-1', reelPositions: [1, 2, 3], winAmount: 10 };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => result,
    });

    const client = createFetchEngineClient(baseUrl);
    await expect(client.requestSpin()).resolves.toEqual(result);
    expect(fetch).toHaveBeenCalledWith(`${baseUrl}/spins`, { method: 'POST' });
  });

  it('rejects when the engine responds with a non-ok status', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const client = createFetchEngineClient(baseUrl);
    await expect(client.requestSpin()).rejects.toThrow(/500/);
  });

  it('retries a spin against the same spinId', async () => {
    const result = { spinId: 'spin-1', reelPositions: [4, 5, 6], winAmount: 0 };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => result,
    });

    const client = createFetchEngineClient(baseUrl);
    await expect(client.retrySpin('spin-1')).resolves.toEqual(result);
    expect(fetch).toHaveBeenCalledWith(`${baseUrl}/spins/spin-1/retry`, { method: 'POST' });
  });
});
