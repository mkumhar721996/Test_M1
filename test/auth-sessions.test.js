const request = require('supertest');
const app = require('../src/server');
const usersStore = require('../src/users/store');
const sessions = require('../src/auth/sessions');

let seq = 0;
function makeUser(roles) {
  seq += 1;
  return usersStore.createUser({ name: 'Session User', email: `session-user-${seq}@company.com`, roles, password: 'test-password' });
}

async function signIn(user) {
  const res = await request(app).post('/auth/sign-in').send({ email: user.email, password: 'test-password' });
  return res.body.token;
}

describe('server-side sessions', () => {
  afterEach(() => jest.restoreAllMocks());

  test('sign-in issues an unguessable token that authenticates /users', async () => {
    const admin = makeUser(['admin']);
    const token = await signIn(admin);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).not.toBe(admin.id);
    const res = await request(app).get('/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('two sign-ins get two different tokens', async () => {
    const admin = makeUser(['admin']);
    expect(await signIn(admin)).not.toBe(await signIn(admin));
  });

  test('knowing an admin account id is not enough: x-user-id alone is rejected', async () => {
    const res = await request(app).get('/users').set('x-user-id', 'usr_001');
    expect(res.status).toBe(401);
  });

  test('a forged or malformed Authorization header is rejected', async () => {
    const admin = makeUser(['admin']);
    for (const header of ['Bearer forged-token', 'Bearer', `Bearer ${admin.id}`, admin.id, 'Basic abc']) {
      const res = await request(app).get('/users').set('Authorization', header);
      expect(res.status).toBe(401);
    }
  });

  test('a failed sign-in does not create a session', async () => {
    const admin = makeUser(['admin']);
    const res = await request(app).post('/auth/sign-in').send({ email: admin.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test('a deactivated account cannot sign in, so no session is issued', async () => {
    const user = makeUser(['admin']);
    usersStore.deactivateUser(user.id);
    const res = await request(app).post('/auth/sign-in').send({ email: user.email, password: 'test-password' });
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });

  test('deactivating an account invalidates its existing session', async () => {
    const admin = makeUser(['admin']);
    const token = await signIn(admin);
    usersStore.deactivateUser(admin.id);
    const res = await request(app).get('/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('sign-out revokes the session', async () => {
    const admin = makeUser(['admin']);
    const token = await signIn(admin);
    const out = await request(app).post('/auth/sign-out').set('Authorization', `Bearer ${token}`);
    expect(out.status).toBe(204);
    const res = await request(app).get('/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('a session expires after its lifetime', async () => {
    const admin = makeUser(['admin']);
    const token = await signIn(admin);
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + sessions.SESSION_TTL_MS + 1000);
    const res = await request(app).get('/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
