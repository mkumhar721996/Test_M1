process.env.SEED_USER_PASSWORD = 'test-seed-password';

const request = require('supertest');
const app = require('../src/server');
const usersStore = require('../src/users/store');

let seq = 0;
function makeUser(roles = ['employee']) {
  seq += 1;
  return usersStore.createUser({ name: 'Sign In User', email: `signin-user-${seq}@company.com`, roles, password: 'test-password' });
}

describe('POST /auth/sign-in', () => {
  test('AC4: an active account signs in with valid credentials', async () => {
    const user = makeUser();
    const res = await request(app).post('/auth/sign-in').send({ email: user.email, password: 'test-password' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, name: 'Sign In User', email: user.email, roles: ['employee'] });
    expect(typeof res.body.token).toBe('string');
  });

  test('AC4: a seeded active account signs in', async () => {
    const res = await request(app).post('/auth/sign-in').send({ email: 'priya.shah@company.com', password: 'test-seed-password' });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['admin', 'finance']);
  });

  test('AC4: sign-in reflects the roles the account currently has', async () => {
    const user = makeUser();
    usersStore.updateRoles(user.id, ['employee', 'finance']);
    const res = await request(app).post('/auth/sign-in').send({ email: user.email, password: 'test-password' });
    expect(res.body.roles).toEqual(['employee', 'finance']);
  });

  test('the old fixed default password does not work for seeded accounts', async () => {
    const res = await request(app).post('/auth/sign-in').send({ email: 'priya.shah@company.com', password: 'demo-password' });
    expect(res.status).toBe(401);
  });

  test('a wrong password or unknown email gets 401 invalid_credentials', async () => {
    const user = makeUser();
    const expected = { error: 'invalid_credentials', message: 'Incorrect email or password.' };
    const wrong = await request(app).post('/auth/sign-in').send({ email: user.email, password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(expected);
    const unknown = await request(app).post('/auth/sign-in').send({ email: 'nobody@company.com', password: 'test-password' });
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(expected);
  });

  test('a missing body gets 401 rather than a server error', async () => {
    const res = await request(app).post('/auth/sign-in').send({});
    expect(res.status).toBe(401);
  });

  test('AC7: a deactivated account cannot sign in, with the exact prototype copy', async () => {
    const user = makeUser();
    usersStore.deactivateUser(user.id);
    const res = await request(app).post('/auth/sign-in').send({ email: user.email, password: 'test-password' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'account_deactivated', message: 'This account has been deactivated. Contact an administrator for access.' });
  });

  test('AC7: the seeded deactivated account cannot sign in', async () => {
    const res = await request(app).post('/auth/sign-in').send({ email: 'elena.brooks@company.com', password: 'test-seed-password' });
    expect(res.status).toBe(403);
  });

  test('AC7: a deactivated account with a wrong password does not reveal its status', async () => {
    const user = makeUser();
    usersStore.deactivateUser(user.id);
    const res = await request(app).post('/auth/sign-in').send({ email: user.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  test('a reactivated account can sign in again', async () => {
    const user = makeUser();
    usersStore.deactivateUser(user.id);
    usersStore.reactivateUser(user.id);
    const res = await request(app).post('/auth/sign-in').send({ email: user.email, password: 'test-password' });
    expect(res.status).toBe(200);
  });
});
