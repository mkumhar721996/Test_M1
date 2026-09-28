const request = require('supertest');
const { findDuplicateHires } = require('../src/hires/store');
const app = require('../src/server');

const existing = {
  id: 'hire_2031',
  name: 'Jordan Reyes',
  email: 'jordan.reyes@example.com',
  phone: '(312) 555-0148',
  startDate: '2026-10-05',
  department: 'Engineering',
  role: 'Software Engineer II',
  hireStage: 'draft',
  profileStatus: 'active',
};

test('AC1: findDuplicateHires matches on a case/whitespace-insensitive email', () => {
  expect(findDuplicateHires({ email: '  Jordan.Reyes@Example.com ', phone: '' }, [existing])).toEqual([
    { profile: existing, reasons: ['email'] },
  ]);
});

test('AC1: findDuplicateHires matches on a formatting-insensitive phone number', () => {
  expect(findDuplicateHires({ email: '', phone: '312-555-0148' }, [existing])).toEqual([
    { profile: existing, reasons: ['phone'] },
  ]);
});

test('AC1: GET /hires/duplicates returns the seeded profile with reasons, and does not create a new profile', async () => {
  const before = await request(app).get('/hires');
  const beforeCount = before.body.length;

  const res = await request(app).get('/hires/duplicates').query({ email: 'jordan.reyes@example.com' });
  expect(res.status).toBe(200);
  expect(res.body).toEqual([{ profile: expect.objectContaining({ id: 'hire_2031' }), reasons: ['email'] }]);

  const after = await request(app).get('/hires');
  expect(after.body.length).toBe(beforeCount);
});

test('AC6: findDuplicateHires returns [] when no email or phone matches', () => {
  expect(findDuplicateHires({ email: 'new.person@example.com', phone: '5550001111' }, [existing])).toEqual([]);
});

test('AC6: GET /hires/duplicates returns [] for non-matching params', async () => {
  const res = await request(app).get('/hires/duplicates').query({ email: 'nobody@example.com', phone: '0000000000' });
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});
