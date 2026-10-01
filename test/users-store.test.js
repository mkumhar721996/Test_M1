const usersStore = require('../src/users/store');

const { createUser, getUser, listUsers, updateRoles, deactivateUser, reactivateUser, authenticate, canManageUsers, UserValidationError } = usersStore;

let seq = 0;
function uniqueEmail() {
  seq += 1;
  return `store-user-${seq}@company.com`;
}

describe('users store', () => {
  test('AC1: createUser with at least one role creates an active account', () => {
    const user = createUser({ name: 'Jordan Avery', email: uniqueEmail(), roles: ['employee'], password: 'test-password' });
    expect(user.id).toBeDefined();
    expect(user.status).toBe('active');
    expect(user.roles).toEqual(['employee']);
    expect(getUser(user.id)).toMatchObject({ id: user.id, name: 'Jordan Avery' });
  });

  test('AC1: the stored account never exposes a password or hash', () => {
    const user = createUser({ name: 'Jordan Avery', email: uniqueEmail(), roles: ['employee'], password: 'test-password' });
    expect(JSON.stringify(getUser(user.id))).not.toMatch(/password|hash|scrypt/i);
    expect(JSON.stringify(listUsers())).not.toMatch(/passwordHash/);
  });

  test('AC1: without a password a temporary password is generated and returned once', () => {
    const user = createUser({ name: 'Jordan Avery', email: uniqueEmail(), roles: ['employee'] });
    expect(typeof user.temporaryPassword).toBe('string');
    expect(user.temporaryPassword.length).toBeGreaterThanOrEqual(10);
    expect(getUser(user.id).temporaryPassword).toBeUndefined();
    expect(authenticate(user.email, user.temporaryPassword).ok).toBe(true);
  });

  test('AC3: createUser with no roles throws a validation error naming the roles field', () => {
    expect.assertions(4);
    try {
      createUser({ name: 'No Role', email: uniqueEmail(), roles: [] });
    } catch (err) {
      expect(err).toBeInstanceOf(UserValidationError);
      expect(err.statusCode).toBe(400);
      expect(err.fields.roles).toMatch(/at least one role/i);
      expect(err.fields.roles).toBe('Select at least one role so this account has permissions to sign in with.');
    }
  });

  test('AC3: a missing or non-array roles value is rejected and nothing is created', () => {
    const before = listUsers().length;
    expect(() => createUser({ name: 'No Role', email: uniqueEmail() })).toThrow(UserValidationError);
    expect(() => createUser({ name: 'No Role', email: uniqueEmail(), roles: 'admin' })).toThrow(UserValidationError);
    expect(() => createUser({ name: 'No Role', email: uniqueEmail(), roles: ['superuser'] })).toThrow(UserValidationError);
    expect(listUsers().length).toBe(before);
  });

  test('createUser rejects a missing name, an invalid email, and a duplicate email', () => {
    const email = uniqueEmail();
    createUser({ name: 'First', email, roles: ['employee'] });
    const fieldsOf = (data) => {
      try { createUser(data); } catch (err) { return err.fields; }
      return null;
    };
    expect(fieldsOf({ name: '', email: uniqueEmail(), roles: ['employee'] }).name).toBeDefined();
    expect(fieldsOf({ name: 'X', email: 'not-an-email', roles: ['employee'] }).email).toBeDefined();
    expect(fieldsOf({ name: 'X', email: email.toUpperCase(), roles: ['employee'] }).email).toMatch(/already/i);
  });

  test('AC5: updateRoles replaces the roles on the same account; empty roles are rejected', () => {
    const user = createUser({ name: 'Role Change', email: uniqueEmail(), roles: ['employee'] });
    const updated = updateRoles(user.id, ['employee', 'finance']);
    expect(updated.id).toBe(user.id);
    expect(getUser(user.id).roles).toEqual(['employee', 'finance']);
    expect(() => updateRoles(user.id, [])).toThrow(UserValidationError);
    expect(getUser(user.id).roles).toEqual(['employee', 'finance']);
    expect(updateRoles('missing-id', ['employee'])).toBeNull();
  });

  test('AC7/AC8: deactivateUser keeps the full record, flips status, and can be reversed', () => {
    const user = createUser({ name: 'Elena Test', email: uniqueEmail(), roles: ['employee', 'finance'] });
    deactivateUser(user.id);
    expect(getUser(user.id)).toMatchObject({ id: user.id, name: 'Elena Test', status: 'deactivated' });
    expect(getUser(user.id).deactivatedAt).toBeDefined();
    expect(listUsers().some((u) => u.id === user.id)).toBe(true);
    reactivateUser(user.id);
    expect(getUser(user.id).status).toBe('active');
    expect(getUser(user.id).deactivatedAt).toBeUndefined();
    expect(deactivateUser('missing-id')).toBeNull();
  });

  test('AC4/AC7: authenticate succeeds for active accounts and reports why it fails otherwise', () => {
    const email = uniqueEmail();
    const user = createUser({ name: 'Sign In', email, roles: ['employee'], password: 'test-password' });
    expect(authenticate(email, 'test-password')).toMatchObject({ ok: true, user: { id: user.id } });
    expect(authenticate(email.toUpperCase(), 'test-password').ok).toBe(true);
    expect(authenticate(email, 'wrong-password')).toEqual({ ok: false, reason: 'invalid_credentials' });
    expect(authenticate('nobody@company.com', 'test-password')).toEqual({ ok: false, reason: 'invalid_credentials' });
    expect(authenticate(undefined, undefined)).toEqual({ ok: false, reason: 'invalid_credentials' });
    deactivateUser(user.id);
    expect(authenticate(email, 'test-password')).toEqual({ ok: false, reason: 'deactivated' });
    expect(authenticate(email, 'wrong-password')).toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  test('AC10: canManageUsers is true only for admin or finance', () => {
    expect(canManageUsers(['admin'])).toBe(true);
    expect(canManageUsers(['employee', 'finance'])).toBe(true);
    expect(canManageUsers(['employee'])).toBe(false);
    expect(canManageUsers([])).toBe(false);
    expect(canManageUsers(undefined)).toBe(false);
  });

  test('seed data: four fixture accounts, the last deactivated', () => {
    const byName = Object.fromEntries(listUsers().map((u) => [u.name, u]));
    expect(byName['Priya Shah'].roles).toEqual(['admin', 'finance']);
    expect(byName['Morgan Ellis'].roles).toEqual(['employee']);
    expect(byName['Devon Ruiz'].roles).toEqual(['employee']);
    expect(byName['Elena Brooks']).toMatchObject({ roles: ['employee', 'finance'], status: 'deactivated' });
  });
});

describe('seed account passwords', () => {
  const ORIGINAL = process.env.SEED_USER_PASSWORD;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SEED_USER_PASSWORD; else process.env.SEED_USER_PASSWORD = ORIGINAL;
  });

  function loadFresh() {
    let fresh;
    jest.isolateModules(() => { fresh = require('../src/users/store'); });
    return fresh;
  }

  test('seeded accounts use SEED_USER_PASSWORD when it is set', () => {
    process.env.SEED_USER_PASSWORD = 'test-seed-password';
    const fresh = loadFresh();
    expect(fresh.authenticate('priya.shah@company.com', 'test-seed-password').ok).toBe(true);
  });

  test('without SEED_USER_PASSWORD no fixed default password works', () => {
    delete process.env.SEED_USER_PASSWORD;
    const fresh = loadFresh();
    expect(fresh.authenticate('priya.shah@company.com', 'demo-password').ok).toBe(false);
    expect(fresh.authenticate('priya.shah@company.com', '').ok).toBe(false);
  });
});
