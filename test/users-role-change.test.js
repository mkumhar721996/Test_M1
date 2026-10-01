const request = require('supertest');
const { app, bearer, adminToken, actorWith } = require('./helpers/users-auth');

async function setRoles(id, roles) {
  return request(app).patch(`/users/${id}/roles`).set(bearer(await adminToken())).send({ roles });
}

test('AC6: a signed-in employee is denied, then allowed on their next request after being granted finance, with the same token', async () => {
  const actor = await actorWith(['employee'], 'change.grant');
  const before = await request(app).get('/users').set(bearer(actor.token));
  expect(before.status).toBe(403);

  expect((await setRoles(actor.user.id, ['employee', 'finance'])).status).toBe(200);

  const after = await request(app).get('/users').set(bearer(actor.token));
  expect(after.status).toBe(200);
});

test('AC6: removing finance from a signed-in finance account denies their next request, with the same token', async () => {
  const actor = await actorWith(['finance'], 'change.revoke');
  expect((await request(app).get('/users').set(bearer(actor.token))).status).toBe(200);

  expect((await setRoles(actor.user.id, ['employee'])).status).toBe(200);

  expect((await request(app).get('/users').set(bearer(actor.token))).status).toBe(403);
});

test('AC5: the role change updates the one account in place and is what authorization reads', async () => {
  const actor = await actorWith(['employee'], 'change.inplace');
  await setRoles(actor.user.id, ['admin']);
  const list = await request(app).get('/users').set(bearer(actor.token));
  expect(list.status).toBe(200);
  expect(list.body.filter((u) => u.email === actor.email)).toHaveLength(1);
  expect(list.body.find((u) => u.id === actor.user.id).roles).toEqual(['admin']);
});

test('a demoted account that loses every manager role cannot manage users, even mid-session', async () => {
  const actor = await actorWith(['admin'], 'change.demote');
  const create = { name: 'Created Before', email: 'change.demote.child@company.com', roles: ['employee'] };
  expect((await request(app).post('/users').set(bearer(actor.token)).send(create)).status).toBe(201);
  await setRoles(actor.user.id, ['employee']);
  const again = { name: 'Created After', email: 'change.demote.child2@company.com', roles: ['employee'] };
  expect((await request(app).post('/users').set(bearer(actor.token)).send(again)).status).toBe(403);
});
