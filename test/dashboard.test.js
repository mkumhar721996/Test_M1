jest.mock('../src/dashboard/arcClient');

describe('GET /dashboard — arc degradation handling', () => {
  let request;
  let app;
  let arcClient;

  beforeEach(() => {
    jest.resetModules();
    request = require('supertest');
    app = require('../src/server');
    arcClient = require('../src/dashboard/arcClient');
  });

  test('AC1: falls back to cached data with a stale flag when arc fails after a prior success', async () => {
    arcClient.fetchPipelineStatus.mockResolvedValueOnce([{ hireId: 'hire_2031', stage: 'offer' }]);
    await request(app).get('/dashboard');

    arcClient.fetchPipelineStatus.mockRejectedValueOnce(new Error('arc down'));
    const res = await request(app).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.stale).toBe(true);
    expect(res.body.data).toEqual([{ hireId: 'hire_2031', stage: 'offer' }]);
  });

  test('AC3: a subsequent successful fetch returns fresh, non-stale data', async () => {
    arcClient.fetchPipelineStatus.mockResolvedValueOnce([{ hireId: 'hire_2031', stage: 'offer' }]);
    await request(app).get('/dashboard');

    arcClient.fetchPipelineStatus.mockRejectedValueOnce(new Error('arc down'));
    await request(app).get('/dashboard');

    arcClient.fetchPipelineStatus.mockResolvedValueOnce([{ hireId: 'hire_2031', stage: 'background_check' }]);
    const res = await request(app).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.stale).toBe(false);
    expect(res.body.data).toEqual([{ hireId: 'hire_2031', stage: 'background_check' }]);
  });

  test('cold start: arc fails before any cache exists, so the route returns 503', async () => {
    arcClient.fetchPipelineStatus.mockRejectedValueOnce(new Error('arc down'));
    const res = await request(app).get('/dashboard');

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('arc pipeline integration unavailable');
  });
});
