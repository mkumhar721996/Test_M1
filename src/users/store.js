const crypto = require('crypto');

const users = new Map();

const VALID_ROLES = ['admin', 'finance', 'employee'];
const MANAGER_ROLES = ['admin', 'finance'];

const KEY_LENGTH = 64;
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

const ROLES_REQUIRED_MESSAGE = 'Select at least one role so this account has permissions to sign in with.';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class UserValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

function canManageUsers(roles) {
  return Array.isArray(roles) && roles.some((role) => MANAGER_ROLES.includes(role));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function view(user) {
  const { passwordHash, ...rest } = user;
  return { ...rest, roles: user.roles.slice() };
}

function normalizeEmail(email) {
  return String(email == null ? '' : email).trim().toLowerCase();
}

function rolesError(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return ROLES_REQUIRED_MESSAGE;
  if (!roles.every((role) => VALID_ROLES.includes(role))) return 'Select only valid roles.';
  return null;
}

function emailTaken(email, excludeId) {
  return Array.from(users.values()).some((u) => u.id !== excludeId && u.email === email);
}

function assertValidNewUser(name, email, roles) {
  const fields = {};
  if (!name) {
    fields.name = 'Enter a full name.';
  }
  if (!email) {
    fields.email = 'Enter an email address.';
  } else if (!EMAIL_PATTERN.test(email)) {
    fields.email = 'Enter a valid email address.';
  } else if (emailTaken(email, null)) {
    fields.email = 'An account with this email already exists.';
  }
  const roleProblem = rolesError(roles);
  if (roleProblem) fields.roles = roleProblem;
  if (Object.keys(fields).length > 0) {
    throw new UserValidationError('validation_error', fields);
  }
}

function insertUser({ id, name, email, roles, password }) {
  const iso = new Date().toISOString();
  const user = {
    id,
    name,
    email,
    roles: Array.from(new Set(roles)),
    passwordHash: hashPassword(password),
    status: 'active',
    lastActive: null,
    deactivatedAt: null,
    createdAt: iso,
    updatedAt: iso,
  };
  users.set(user.id, user);
  return user;
}

function createUser(data) {
  const name = String(data.name == null ? '' : data.name).trim();
  const email = normalizeEmail(data.email);
  assertValidNewUser(name, email, data.roles);
  const temporaryPassword = crypto.randomBytes(12).toString('base64url');
  const user = insertUser({ id: crypto.randomUUID(), name, email, roles: data.roles, password: temporaryPassword });
  return { ...view(user), temporaryPassword };
}

function getUser(id) {
  const user = users.get(id);
  return user ? view(user) : undefined;
}

function getUserByEmail(email) {
  const needle = normalizeEmail(email);
  const user = Array.from(users.values()).find((u) => u.email === needle);
  return user ? view(user) : undefined;
}

function listUsers() {
  return Array.from(users.values()).map(view);
}

function setUserRoles(id, roles) {
  const user = users.get(id);
  if (!user) return undefined;

  const roleProblem = rolesError(roles);
  if (roleProblem) {
    throw new UserValidationError('validation_error', { roles: roleProblem });
  }
  user.roles = Array.from(new Set(roles));
  user.updatedAt = new Date().toISOString();
  return view(user);
}

function deactivateUser(id) {
  const user = users.get(id);
  if (!user) return undefined;

  const iso = new Date().toISOString();
  user.status = 'deactivated';
  user.deactivatedAt = iso;
  user.updatedAt = iso;
  return view(user);
}

function reactivateUser(id) {
  const user = users.get(id);
  if (!user) return undefined;

  user.status = 'active';
  user.deactivatedAt = null;
  user.updatedAt = new Date().toISOString();
  return view(user);
}

function authenticate(email, password) {
  const user = Array.from(users.values()).find((u) => u.email === normalizeEmail(email));
  const supplied = typeof password === 'string' ? password : '';
  const verified = verifyPassword(supplied, user ? user.passwordHash : DUMMY_HASH);
  if (!user || supplied === '' || !verified) return { ok: false, reason: 'invalid_credentials' };
  if (user.status === 'deactivated') return { ok: false, reason: 'deactivated' };

  user.lastActive = new Date().toISOString();
  return { ok: true, user: view(user) };
}

function seedPassword() {
  if (process.env.SEED_USER_PASSWORD) return process.env.SEED_USER_PASSWORD;
  if (process.env.NODE_ENV !== 'test') {
    console.warn('SEED_USER_PASSWORD is not set: the seeded admin account cannot be signed in to.');
  }
  return crypto.randomBytes(24).toString('base64url');
}

insertUser({
  id: 'usr_001',
  name: 'Priya Shah',
  email: 'priya.shah@company.com',
  roles: ['admin', 'finance'],
  password: seedPassword(),
});

module.exports = {
  VALID_ROLES,
  UserValidationError,
  canManageUsers,
  createUser,
  getUser,
  getUserByEmail,
  listUsers,
  setUserRoles,
  deactivateUser,
  reactivateUser,
  authenticate,
};
