const {
  UserValidationError,
  VALID_ROLES,
  canManageUsers,
  createUser,
  getUser,
  getUserByEmail,
  listUsers,
  setUserRoles,
  deactivateUser,
  reactivateUser,
  authenticate,
} = require('../src/users/store');

const ROLES_REQUIRED_MESSAGE = 'Select at least one role so this account has permissions to sign in with.';

test('seed: the fixture admin account exists so the system is never locked out', () => {
  const seed = getUserByEmail('priya.shah@company.com');
  expect(seed).toMatchObject({ name: 'Priya Shah', roles: ['admin', 'finance'], status: 'active' });
});

test('VALID_ROLES lists exactly admin, finance and employee', () => {
  expect(VALID_ROLES).toEqual(['admin', 'finance', 'employee']);
});

test('AC1: createUser creates an active account with the submitted name, email and roles', () => {
  const user = createUser({ name: 'Jordan Avery', email: 'store.jordan@company.com', roles: ['employee'] });
  expect(user).toMatchObject({
    name: 'Jordan Avery',
    email: 'store.jordan@company.com',
    roles: ['employee'],
    status: 'active',
  });
  expect(typeof user.id).toBe('string');
});

test('createUser returns a generated temporary password once and never exposes a hash', () => {
  const user = createUser({ name: 'Temp Pw', email: 'store.temp@company.com', roles: ['employee'] });
  expect(typeof user.temporaryPassword).toBe('string');
  expect(user.temporaryPassword.length).toBeGreaterThanOrEqual(12);
  expect(user).not.toHaveProperty('passwordHash');
  expect(getUser(user.id)).not.toHaveProperty('temporaryPassword');
  expect(getUser(user.id)).not.toHaveProperty('passwordHash');
  expect(listUsers().every((u) => !('passwordHash' in u))).toBe(true);
});

test('two accounts never share a temporary password', () => {
  const a = createUser({ name: 'A', email: 'store.pwa@company.com', roles: ['employee'] });
  const b = createUser({ name: 'B', email: 'store.pwb@company.com', roles: ['employee'] });
  expect(a.temporaryPassword).not.toBe(b.temporaryPassword);
});

test('AC2: a created account is returned by listUsers and getUser', () => {
  const user = createUser({ name: 'Taylor Shaw', email: 'store.taylor@company.com', roles: ['finance'] });
  expect(listUsers().some((u) => u.id === user.id)).toBe(true);
  expect(getUser(user.id)).toMatchObject({ email: 'store.taylor@company.com' });
});

test('AC3: createUser with an empty roles array throws a UserValidationError naming the roles field', () => {
  let error;
  try {
    createUser({ name: 'No Role', email: 'store.norole@company.com', roles: [] });
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(UserValidationError);
  expect(error.statusCode).toBe(400);
  expect(error.fields.roles).toBe(ROLES_REQUIRED_MESSAGE);
  expect(getUserByEmail('store.norole@company.com')).toBeUndefined();
});

test('AC3: createUser with roles omitted or not an array is rejected', () => {
  expect(() => createUser({ name: 'A', email: 'store.omitted@company.com' })).toThrow(UserValidationError);
  expect(() => createUser({ name: 'A', email: 'store.string@company.com', roles: 'admin' })).toThrow(UserValidationError);
});

test('createUser rejects an unknown role', () => {
  let error;
  try {
    createUser({ name: 'A', email: 'store.badrole@company.com', roles: ['superuser'] });
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(UserValidationError);
  expect(error.fields.roles).toBeTruthy();
});

test('createUser rejects a missing name, a missing or malformed email, and a duplicate email', () => {
  expect(() => createUser({ name: '', email: 'store.noname@company.com', roles: ['employee'] })).toThrow(UserValidationError);
  expect(() => createUser({ name: 'A', email: '', roles: ['employee'] })).toThrow(UserValidationError);
  expect(() => createUser({ name: 'A', email: 'not-an-email', roles: ['employee'] })).toThrow(UserValidationError);
  createUser({ name: 'A', email: 'store.dupe@company.com', roles: ['employee'] });
  expect(() => createUser({ name: 'B', email: 'STORE.DUPE@company.com', roles: ['employee'] })).toThrow(UserValidationError);
});

test('AC5: setUserRoles updates the same account in place and never creates a second one', () => {
  const user = createUser({ name: 'Devon Ruiz', email: 'store.devon@company.com', roles: ['employee'] });
  const before = listUsers().length;
  const updated = setUserRoles(user.id, ['employee', 'finance']);
  expect(updated).toMatchObject({ id: user.id, roles: ['employee', 'finance'] });
  expect(listUsers()).toHaveLength(before);
  const removed = setUserRoles(user.id, ['finance']);
  expect(removed.roles).toEqual(['finance']);
});

test('AC5: setUserRoles rejects removing every role and leaves the account unchanged', () => {
  const user = createUser({ name: 'Keep Roles', email: 'store.keep@company.com', roles: ['employee'] });
  expect(() => setUserRoles(user.id, [])).toThrow(UserValidationError);
  expect(getUser(user.id).roles).toEqual(['employee']);
});

test('setUserRoles returns undefined for an unknown id', () => {
  expect(setUserRoles('missing', ['employee'])).toBeUndefined();
});

test('AC4: authenticate succeeds for a newly created active account with its temporary password', () => {
  const user = createUser({ name: 'Sign In', email: 'store.signin@company.com', roles: ['employee'] });
  const result = authenticate('Store.SignIn@company.com', user.temporaryPassword);
  expect(result.ok).toBe(true);
  expect(result.user).toMatchObject({ id: user.id, roles: ['employee'] });
  expect(result.user).not.toHaveProperty('passwordHash');
});

test('authenticate rejects a wrong password with the same reason as an unknown email', () => {
  createUser({ name: 'Wrong Pw', email: 'store.wrongpw@company.com', roles: ['employee'] });
  expect(authenticate('store.wrongpw@company.com', 'not-the-password')).toEqual({ ok: false, reason: 'invalid_credentials' });
  expect(authenticate('nobody@company.com', 'not-the-password')).toEqual({ ok: false, reason: 'invalid_credentials' });
});

test('authenticate rejects an empty or non-string password', () => {
  const user = createUser({ name: 'Empty Pw', email: 'store.emptypw@company.com', roles: ['employee'] });
  expect(authenticate('store.emptypw@company.com', '').ok).toBe(false);
  expect(authenticate('store.emptypw@company.com', undefined).ok).toBe(false);
  expect(authenticate('store.emptypw@company.com', { toString: () => user.temporaryPassword }).ok).toBe(false);
});

test('AC7: a deactivated account is refused, and only after the password verifies', () => {
  const user = createUser({ name: 'Gone', email: 'store.gone@company.com', roles: ['employee'] });
  deactivateUser(user.id);
  expect(authenticate('store.gone@company.com', user.temporaryPassword)).toEqual({ ok: false, reason: 'deactivated' });
  expect(authenticate('store.gone@company.com', 'not-the-password')).toEqual({ ok: false, reason: 'invalid_credentials' });
});

test('AC7: reactivateUser lets the account authenticate again', () => {
  const user = createUser({ name: 'Back', email: 'store.back@company.com', roles: ['employee'] });
  deactivateUser(user.id);
  expect(reactivateUser(user.id)).toMatchObject({ status: 'active', deactivatedAt: null });
  expect(authenticate('store.back@company.com', user.temporaryPassword).ok).toBe(true);
});

test('AC6: a role change is visible on the very next lookup', () => {
  const user = createUser({ name: 'Live Role', email: 'store.live@company.com', roles: ['employee'] });
  expect(authenticate('store.live@company.com', user.temporaryPassword).user.roles).toEqual(['employee']);
  setUserRoles(user.id, ['finance']);
  expect(getUser(user.id).roles).toEqual(['finance']);
  expect(authenticate('store.live@company.com', user.temporaryPassword).user.roles).toEqual(['finance']);
});

test('AC8: deactivating retains the account record for historical reference', () => {
  const user = createUser({ name: 'Elena Brooks', email: 'store.elena@company.com', roles: ['employee', 'finance'] });
  const deactivated = deactivateUser(user.id);
  expect(deactivated).toMatchObject({
    id: user.id,
    name: 'Elena Brooks',
    email: 'store.elena@company.com',
    roles: ['employee', 'finance'],
    status: 'deactivated',
  });
  expect(typeof deactivated.deactivatedAt).toBe('string');
  expect(listUsers().some((u) => u.id === user.id)).toBe(true);
});

test('AC9: a deactivated account stays in listUsers with status deactivated', () => {
  const user = createUser({ name: 'Listed', email: 'store.listed@company.com', roles: ['employee'] });
  deactivateUser(user.id);
  expect(listUsers().find((u) => u.id === user.id).status).toBe('deactivated');
});

test('deactivateUser and reactivateUser return undefined for an unknown id', () => {
  expect(deactivateUser('missing')).toBeUndefined();
  expect(reactivateUser('missing')).toBeUndefined();
});

test('returned records are copies: mutating them does not change the store', () => {
  const user = createUser({ name: 'Copy', email: 'store.copy@company.com', roles: ['employee'] });
  user.roles.push('admin');
  user.status = 'deactivated';
  expect(getUser(user.id)).toMatchObject({ roles: ['employee'], status: 'active' });
});

test('AC10: canManageUsers allows accounts holding admin or finance and denies everyone else', () => {
  expect(canManageUsers(['admin'])).toBe(true);
  expect(canManageUsers(['employee', 'finance'])).toBe(true);
  expect(canManageUsers(['employee'])).toBe(false);
  expect(canManageUsers([])).toBe(false);
  expect(canManageUsers(undefined)).toBe(false);
  expect(canManageUsers('admin')).toBe(false);
});

describe('seed account password', () => {
  afterEach(() => {
    delete process.env.SEED_USER_PASSWORD;
    jest.resetModules();
  });

  test('the seed admin can sign in with the SEED_USER_PASSWORD env value', () => {
    process.env.SEED_USER_PASSWORD = 'test-seed-password';
    jest.isolateModules(() => {
      const store = require('../src/users/store');
      expect(store.authenticate('priya.shah@company.com', 'test-seed-password').ok).toBe(true);
      expect(store.authenticate('priya.shah@company.com', 'demo-password').ok).toBe(false);
    });
  });

  test('without the env var there is no usable default password', () => {
    delete process.env.SEED_USER_PASSWORD;
    jest.isolateModules(() => {
      const store = require('../src/users/store');
      ['', 'password', 'demo-password', 'test-password', 'admin'].forEach((guess) => {
        expect(store.authenticate('priya.shah@company.com', guess).ok).toBe(false);
      });
    });
  });
});
