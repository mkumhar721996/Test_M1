const request = require('supertest');
const { app, bearer, actorWith, uniqueEmail } = require('./helpers/users-auth');
const usersStore = require('../src/users/store');

const DENIED_MESSAGE = 'User & role management is limited to Admin and Finance accounts. Ask an administrator for the Admin or Finance role.';

function seedUser(prefix) {
  return usersStore.createUser({ name: 'Enforcement Target', email: uniqueEmail(prefix), roles: ['employee'] });
}

const ENDPOINTS = [
  { name: 'list', build: () => ({ method: 'get', path: '/users' }) },
  { name: 'create', build: () => ({ method: 'post', path: '/users', body: { name: 'Blocked', email: 'enforce.blocked@company.com', roles: ['employee'] } }) },
  { name: 'edit-roles', build: (id) => ({ method: 'patch', path: `/users/${id}/roles`, body: { roles: ['admin'] } }) },
  { name: 'deactivate', build: (id) => ({ method: 'post', path: `/users/${id}/deactivate`, body: {} }) },
  { name: 'reactivate', build: (id) => ({ method: 'post', path: `/users/${id}/reactivate`, body: {} }) },
];

describe.each(ENDPOINTS)('$name', ({ name, build }) => {
  test('AC10: a signed-in employee-only account is denied with 403 and nothing changes', async () => {
    const employee = await actorWith(['employee'], `enforce.${name}`);
    const target = seedUser(`enforce.${name}.target`);
    const { method, path, body } = build(target.id);
    const countBefore = usersStore.listUsers().length;
    const res = await request(app)[method](path).set(bearer(employee.token)).send(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', message: DENIED_MESSAGE });
    expect(usersStore.listUsers()).toHaveLength(countBefore);
    expect(usersStore.getUser(target.id)).toMatchObject({ roles: ['employee'], status: 'active' });
  });

  test('AC10: an unauthenticated request is rejected with 401, whatever role header it claims', async () => {
    const target = seedUser(`enforce.${name}.anon`);
    const { method, path, body } = build(target.id);
    const res = await request(app)[method](path).set('x-staff-role', 'admin').send(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  test.each([['admin'], ['finance']])('a signed-in %s account is allowed through the guard', async (role) => {
    const actor = await actorWith([role], `enforce.${name}.${role}`);
    const target = seedUser(`enforce.${name}.${role}.target`);
    const { method, path, body } = build(target.id);
    const res = await request(app)[method](path).set(bearer(actor.token)).send(body);
    expect([401, 403]).not.toContain(res.status);
  });
});
