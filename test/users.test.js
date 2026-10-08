const request = require('supertest');
const app = require('../src/server');

const validPayload = {
  name: 'Taylor Reed', email: 'taylor.reed@example.com', password: 'test-pass1', termsAccepted: true,
};

describe('POST /users', () => {
  beforeEach(() => { jest.resetModules(); });

  test('AC1: valid registration creates a new user account', async () => {
    const fresh = require('../src/server');
    const res = await request(fresh).post('/users').send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Taylor Reed', email: 'taylor.reed@example.com' });
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.password).toBeUndefined();
  });

  test('a second registration with the same email (any case) is rejected, proving the first was persisted', async () => {
    const fresh = require('../src/server');
    await request(fresh).post('/users').send(validPayload);
    const res = await request(fresh).post('/users').send({ ...validPayload, email: 'Taylor.Reed@Example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email_taken');
  });

  test('invalid registration data is rejected with field errors', async () => {
    const res = await request(app).post('/users').send({ name: '', email: 'not-an-email', password: 'short', termsAccepted: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.fields).toEqual(expect.objectContaining({
      name: expect.any(String), email: expect.any(String), password: expect.any(String), termsAccepted: expect.any(String),
    }));
  });

  test('does not store the password in plain text', () => {
    const { createUser } = require('../src/users/store');
    const user = createUser({ ...validPayload, email: 'hash@example.com' });
    expect(JSON.stringify(user)).not.toContain(validPayload.password);
  });
});
