const request = require('supertest');
const app = require('../src/server');

test('AC1: returns only this technician\'s Assigned/Accepted/In Progress jobs, sorted ascending by scheduled time', async () => {
  const res = await request(app).get('/jobs').set('x-user-id', 'marcus-webb');
  expect(res.status).toBe(200);
  expect(res.body.length).toBeGreaterThan(0);
  expect(res.body.every((j) => ['Assigned', 'Accepted', 'In Progress'].includes(j.status))).toBe(true);
  expect(res.body.find((j) => j.id === 'JOB-9001')).toBeUndefined();
  expect(res.body.find((j) => j.id === 'JOB-9002')).toBeUndefined();
  const times = res.body.map((j) => new Date(j.scheduledStart).getTime());
  expect(times).toEqual([...times].sort((a, b) => a - b));
});

test('rejects requests without an identity', async () => {
  const res = await request(app).get('/jobs');
  expect(res.status).toBe(401);
});
