const request = require('supertest');
const app = require('../src/server');
const usersStore = require('../src/users/store');

let seq = 0;
function uniqueEmail() {
  seq += 1;
  return `route-user-${seq}@company.com`;
}

function makeUser(roles, overrides = {}) {
  return usersStore.createUser({ name: 'Route User', email: uniqueEmail(), roles, password: 'test-password', ...overrides });
}

async function makeActor(roles) {
  const user = makeUser(roles);
  const res = await request(app).post('/auth/sign-in').send({ email: user.email, password: 'test-password' });
  return { user, auth: `Bearer ${res.body.token}` };
}

const DENIED_BODY = { error: 'forbidden', message: "You don't have permission to manage user accounts" };

const ENDPOINTS = [
  { name: 'list', build: () => ({ method: 'get', path: '/users' }) },
  { name: 'create', build: () => ({ method: 'post', path: '/users', body: { name: 'New Person', email: uniqueEmail(), roles: ['employee'] } }) },
  { name: 'update roles', build: (id) => ({ method: 'patch', path: `/users/${id}/roles`, body: { roles: ['admin'] } }) },
  { name: 'deactivate', build: (id) => ({ method: 'post', path: `/users/${id}/deactivate`, body: {} }) },
  { name: 'reactivate', build: (id) => ({ method: 'post', path: `/users/${id}/reactivate`, body: {} }) },
];

describe.each(ENDPOINTS)('$name', ({ build }) => {
  test('AC10: an employee-only account gets 403 and nothing changes', async () => {
    const employee = await makeActor(['employee']);
    const target = makeUser(['employee']);
    const before = usersStore.listUsers().length;
    const targetBefore = usersStore.getUser(target.id);
    const { method, path, body } = build(target.id);
    const res = await request(app)[method](path).set('Authorization', employee.auth).send(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(DENIED_BODY);
    expect(usersStore.listUsers().length).toBe(before);
    expect(usersStore.getUser(target.id)).toEqual(targetBefore);
  });

  test('AC10: no Authorization header gets 401 and nothing changes', async () => {
    const target = makeUser(['employee']);
    const before = usersStore.listUsers().length;
    const targetBefore = usersStore.getUser(target.id);
    const { method, path, body } = build(target.id);
    const res = await request(app)[method](path).send(body);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(usersStore.listUsers().length).toBe(before);
    expect(usersStore.getUser(target.id)).toEqual(targetBefore);
  });

  test('an unknown token gets 401', async () => {
    const target = makeUser(['employee']);
    const { method, path, body } = build(target.id);
    const res = await request(app)[method](path).set('Authorization', 'Bearer does-not-exist').send(body);
    expect(res.status).toBe(401);
  });

  test('a deactivated admin account is rejected with 401', async () => {
    const admin = await makeActor(['admin']);
    const target = makeUser(['employee']);
    usersStore.deactivateUser(admin.user.id);
    const { method, path, body } = build(target.id);
    const res = await request(app)[method](path).set('Authorization', admin.auth).send(body);
    expect(res.status).toBe(401);
  });

  test.each([['admin'], ['finance']])('a %s account is processed normally', async (role) => {
    const actor = await makeActor([role]);
    const target = makeUser(['employee']);
    const { method, path, body } = build(target.id);
    const res = await request(app)[method](path).set('Authorization', actor.auth).send(body);
    expect([200, 201]).toContain(res.status);
  });
});

describe('create and list', () => {
  test('AC2: a newly created account appears in GET /users', async () => {
    const admin = await makeActor(['admin']);
    const email = uniqueEmail();
    const res = await request(app).post('/users').set('Authorization', admin.auth).send({ name: 'Jordan Avery', email, roles: ['employee'] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Jordan Avery', email, roles: ['employee'], status: 'active' });
    const list = await request(app).get('/users').set('Authorization', admin.auth);
    expect(list.status).toBe(200);
    expect(list.body.some((u) => u.id === res.body.id)).toBe(true);
  });

  test('AC1: the create response carries a one-time temporaryPassword that signs in', async () => {
    const admin = await makeActor(['admin']);
    const email = uniqueEmail();
    const res = await request(app).post('/users').set('Authorization', admin.auth).send({ name: 'Jordan Avery', email, roles: ['employee'] });
    expect(typeof res.body.temporaryPassword).toBe('string');
    const signIn = await request(app).post('/auth/sign-in').send({ email, password: res.body.temporaryPassword });
    expect(signIn.status).toBe(200);
    const list = await request(app).get('/users').set('Authorization', admin.auth);
    expect(JSON.stringify(list.body)).not.toContain(res.body.temporaryPassword);
  });

  test('AC1: a client-supplied password is ignored in favour of the generated one', async () => {
    const admin = await makeActor(['admin']);
    const email = uniqueEmail();
    const res = await request(app).post('/users').set('Authorization', admin.auth).send({ name: 'Jordan Avery', email, roles: ['employee'], password: 'test-chosen' });
    const signIn = await request(app).post('/auth/sign-in').send({ email, password: 'test-chosen' });
    expect(signIn.status).toBe(401);
    expect(res.body.temporaryPassword).toBeDefined();
  });

  test('AC3: creating with an empty roles array is rejected with a roles error and nothing is created', async () => {
    const admin = await makeActor(['admin']);
    const email = uniqueEmail();
    const res = await request(app).post('/users').set('Authorization', admin.auth).send({ name: 'No Role', email, roles: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.fields.roles).toMatch(/at least one role/i);
    expect(usersStore.getUserByEmail(email)).toBeNull();
  });

  test('AC3: creating with no roles field at all is rejected', async () => {
    const admin = await makeActor(['admin']);
    const res = await request(app).post('/users').set('Authorization', admin.auth).send({ name: 'No Role', email: uniqueEmail() });
    expect(res.status).toBe(400);
    expect(res.body.fields.roles).toMatch(/at least one role/i);
  });

  test('a duplicate email is rejected with a field error', async () => {
    const admin = await makeActor(['admin']);
    const existing = makeUser(['employee']);
    const res = await request(app).post('/users').set('Authorization', admin.auth).send({ name: 'Dup', email: existing.email, roles: ['employee'] });
    expect(res.status).toBe(400);
    expect(res.body.fields.email).toMatch(/already/i);
  });

  test('responses never contain a password hash', async () => {
    const admin = await makeActor(['admin']);
    const list = await request(app).get('/users').set('Authorization', admin.auth);
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|scrypt/i);
  });
});

describe('role changes', () => {
  test('AC5/AC6: granting finance to an already-signed-in account changes what that same session can do on its next request', async () => {
    const admin = await makeActor(['admin']);
    const devon = await makeActor(['employee']);
    const before = await request(app).get('/users').set('Authorization', devon.auth);
    expect(before.status).toBe(403);

    const patch = await request(app).patch(`/users/${devon.user.id}/roles`).set('Authorization', admin.auth).send({ roles: ['employee', 'finance'] });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ id: devon.user.id, roles: ['employee', 'finance'] });

    const after = await request(app).get('/users').set('Authorization', devon.auth);
    expect(after.status).toBe(200);
  });

  test('AC5/AC6: removing finance from a signed-in account revokes access on its next request', async () => {
    const admin = await makeActor(['admin']);
    const finance = await makeActor(['employee', 'finance']);
    expect((await request(app).get('/users').set('Authorization', finance.auth)).status).toBe(200);
    await request(app).patch(`/users/${finance.user.id}/roles`).set('Authorization', admin.auth).send({ roles: ['employee'] });
    expect((await request(app).get('/users').set('Authorization', finance.auth)).status).toBe(403);
  });

  test('AC3: removing every role is rejected and the roles are unchanged', async () => {
    const admin = await makeActor(['admin']);
    const target = makeUser(['employee']);
    const res = await request(app).patch(`/users/${target.id}/roles`).set('Authorization', admin.auth).send({ roles: [] });
    expect(res.status).toBe(400);
    expect(res.body.fields.roles).toMatch(/at least one role/i);
    expect(usersStore.getUser(target.id).roles).toEqual(['employee']);
  });

  test('an unknown account id gets 404', async () => {
    const admin = await makeActor(['admin']);
    const res = await request(app).patch('/users/missing-id/roles').set('Authorization', admin.auth).send({ roles: ['employee'] });
    expect(res.status).toBe(404);
  });
});

describe('deactivation', () => {
  test('AC9: a deactivated account is still listed with status "deactivated"', async () => {
    const admin = await makeActor(['admin']);
    const target = makeUser(['employee']);
    const res = await request(app).post(`/users/${target.id}/deactivate`).set('Authorization', admin.auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('deactivated');
    const list = await request(app).get('/users').set('Authorization', admin.auth);
    expect(list.body.find((u) => u.id === target.id).status).toBe('deactivated');
  });

  test('AC7: a deactivated account can no longer act with its existing session even if it had a manage role', async () => {
    const admin = await makeActor(['admin']);
    const finance = await makeActor(['finance']);
    await request(app).post(`/users/${finance.user.id}/deactivate`).set('Authorization', admin.auth).send({});
    const res = await request(app).get('/users').set('Authorization', finance.auth);
    expect(res.status).toBe(401);
  });

  test('reactivating restores an active status; unknown ids get 404', async () => {
    const admin = await makeActor(['admin']);
    const target = makeUser(['employee']);
    usersStore.deactivateUser(target.id);
    const res = await request(app).post(`/users/${target.id}/reactivate`).set('Authorization', admin.auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    const missing = await request(app).post('/users/missing-id/deactivate').set('Authorization', admin.auth).send({});
    expect(missing.status).toBe(404);
  });
});
