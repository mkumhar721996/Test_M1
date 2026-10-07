const request = require('supertest');
const app = require('../src/server');
const { getRequestCounts, getRequestDurations, resetMetrics } = require('../src/observability/metrics');
const { errorHandler } = require('../src/observability/errorHandler');

beforeEach(() => {
  resetMetrics();
});

test('records request counts and durations labelled by route template, method, and status class only', async () => {
  await request(app).get('/leave/types');
  await request(app).get('/employees');

  const counts = getRequestCounts();
  expect(counts['GET /leave/types 2xx']).toBe(1);
  expect(counts['GET /employees 4xx']).toBe(1);

  const durations = getRequestDurations();
  expect(durations['GET /leave/types']).toEqual({ count: 1, avgMs: expect.any(Number) });

  expect(Object.keys(counts).join(' ')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
});

test('errorHandler logs a structured error with route, method, and request id before responding 500', () => {
  const originalError = console.error;
  const logs = [];
  console.error = (entry) => logs.push(entry);

  const err = new Error('boom');
  const req = {
    route: { path: '/balances/:employeeId' },
    baseUrl: '/leave',
    method: 'POST',
    params: { employeeId: 'emp_1' },
    headers: { 'x-request-id': 'req-123' },
  };
  let statusCode;
  let body;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };

  errorHandler(err, req, res, () => {});
  console.error = originalError;

  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({
    message: 'boom',
    route: '/leave/balances/:employeeId',
    method: 'POST',
    params: { employeeId: 'emp_1' },
    requestId: 'req-123',
  });
  expect(logs[0].stack).toEqual(expect.any(String));
  expect(statusCode).toBe(500);
  expect(body).toEqual({ error: 'internal server error' });
});
