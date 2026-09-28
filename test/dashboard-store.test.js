jest.mock('../src/dashboard/arcClient');

describe('dashboard store — arc degradation handling', () => {
  let arcClient;
  let getDashboardData;
  let SIGNIFICANT_STALENESS_MS;

  beforeEach(() => {
    jest.resetModules();
    arcClient = require('../src/dashboard/arcClient');
    ({ getDashboardData, SIGNIFICANT_STALENESS_MS } = require('../src/dashboard/store'));
  });

  test('AC1: when arc fails after a prior success, the last cached data is returned instead of throwing', async () => {
    arcClient.fetchPipelineStatus.mockResolvedValueOnce([{ hireId: 'hire_2031', stage: 'offer' }]);
    await getDashboardData();

    arcClient.fetchPipelineStatus.mockRejectedValueOnce(new Error('arc unreachable'));
    const result = await getDashboardData();

    expect(result.data).toEqual([{ hireId: 'hire_2031', stage: 'offer' }]);
    expect(result.stale).toBe(true);
  });

  test('AC3: once arc recovers, a fresh fetch clears staleness and returns new data', async () => {
    arcClient.fetchPipelineStatus.mockResolvedValueOnce([{ hireId: 'hire_2031', stage: 'offer' }]);
    await getDashboardData();

    arcClient.fetchPipelineStatus.mockRejectedValueOnce(new Error('arc unreachable'));
    const staleResult = await getDashboardData();
    expect(staleResult.stale).toBe(true);

    arcClient.fetchPipelineStatus.mockResolvedValueOnce([{ hireId: 'hire_2031', stage: 'background_check' }]);
    const freshResult = await getDashboardData();
    expect(freshResult.stale).toBe(false);
    expect(freshResult.data).toEqual([{ hireId: 'hire_2031', stage: 'background_check' }]);
  });

  test('AC4: cached data older than the significant-staleness threshold is flagged', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    arcClient.fetchPipelineStatus.mockResolvedValueOnce([{ hireId: 'hire_2031' }]);
    await getDashboardData();

    jest.setSystemTime(new Date(new Date('2026-09-01T00:00:00.000Z').getTime() + SIGNIFICANT_STALENESS_MS + 1000));
    arcClient.fetchPipelineStatus.mockRejectedValueOnce(new Error('down'));
    const result = await getDashboardData();

    expect(result.significantlyStale).toBe(true);
    jest.useRealTimers();
  });

  test('cold start: arc fails before any cache exists, so the store throws', async () => {
    arcClient.fetchPipelineStatus.mockRejectedValueOnce(new Error('arc unreachable'));
    await expect(getDashboardData()).rejects.toThrow('arc unreachable');
  });
});
