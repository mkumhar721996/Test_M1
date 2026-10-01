const crypto = require('crypto');

const users = new Map();

const ALL_ROLES = ['admin', 'finance', 'employee'];
const MANAGER_ROLES = ['admin', 'finance'];
const ROLES_REQUIRED_MESSAGE = 'Select at least one role so this account has permissions to sign in with.';
const KEY_LENGTH = 64;

class UserValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, KEY_LENGTH);
  return crypto.timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

function publicView(record) {
  const { passwordHash, ...rest } = record;
  return { ...rest, roles: record.roles.slice() };
}

function findByEmail(email) {
  const needle = normalizeEmail(email);
  return Array.from(users.values()).find((u) => u.email === needle) || null;
}

function normalizeRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new UserValidationError('validation_error', { roles: ROLES_REQUIRED_MESSAGE });
  }
  if (!roles.every((r) => ALL_ROLES.includes(r))) {
    throw new UserValidationError('validation_error', { roles: 'Select only the roles listed.' });
  }
  return Array.from(new Set(roles));
}

function assertValid(name, email, rolesInput) {
  const fields = {};
  if (!name) {
    fields.name = "Enter the user's full name.";
  }
  if (!email || !isValidEmail(email)) {
    fields.email = 'Enter a valid work email address.';
  } else if (findByEmail(email)) {
    fields.email = 'An account with this email already exists.';
  }
  let roles = [];
  try {
    roles = normalizeRoles(rolesInput);
  } catch (err) {
    fields.roles = err.fields.roles;
  }
  if (Object.keys(fields).length > 0) {
    throw new UserValidationError('validation_error', fields);
  }
  return roles;
}

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD || crypto.randomBytes(18).toString('base64url');
if (!process.env.SEED_USER_PASSWORD && !['production', 'test'].includes(process.env.NODE_ENV)) {
  console.warn('[users] SEED_USER_PASSWORD is not set: seeded accounts have a random password and cannot be signed into.');
}

function seedUser({ id, name, email, roles, status, lastActive, createdAt, deactivatedAt }) {
  const record = { id, name, email, roles, status, lastActive, createdAt, passwordHash: hashPassword(SEED_PASSWORD) };
  if (deactivatedAt) record.deactivatedAt = deactivatedAt;
  users.set(id, record);
}

seedUser({ id: 'usr_001', name: 'Priya Shah', email: 'priya.shah@company.com', roles: ['admin', 'finance'], status: 'active', lastActive: '2026-09-29T15:12:00.000Z', createdAt: '2025-03-10T09:00:00.000Z' });
seedUser({ id: 'usr_002', name: 'Morgan Ellis', email: 'morgan.ellis@company.com', roles: ['employee'], status: 'active', lastActive: '2026-09-30T08:45:00.000Z', createdAt: '2025-04-02T09:00:00.000Z' });
seedUser({ id: 'usr_003', name: 'Devon Ruiz', email: 'devon.ruiz@company.com', roles: ['employee'], status: 'active', lastActive: '2026-09-28T13:20:00.000Z', createdAt: '2025-05-18T09:00:00.000Z' });
seedUser({ id: 'usr_004', name: 'Elena Brooks', email: 'elena.brooks@company.com', roles: ['employee', 'finance'], status: 'deactivated', lastActive: '2026-06-02T10:00:00.000Z', createdAt: '2025-02-01T09:00:00.000Z', deactivatedAt: '2026-06-10T09:30:00.000Z' });

function createUser({ name, email, roles, password } = {}) {
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  const cleanRoles = assertValid(cleanName, cleanEmail, roles);

  const iso = new Date().toISOString();
  const initialPassword = password || crypto.randomBytes(9).toString('base64url');
  const record = {
    id: crypto.randomUUID(),
    name: cleanName,
    email: cleanEmail,
    roles: cleanRoles,
    status: 'active',
    lastActive: iso,
    createdAt: iso,
    passwordHash: hashPassword(initialPassword),
  };
  users.set(record.id, record);

  const view = publicView(record);
  if (!password) view.temporaryPassword = initialPassword;
  return view;
}

function getUser(id) {
  const record = users.get(id);
  return record ? publicView(record) : null;
}

function getUserByEmail(email) {
  const record = findByEmail(email);
  return record ? publicView(record) : null;
}

function listUsers() {
  return Array.from(users.values()).map(publicView);
}

function updateRoles(id, roles) {
  const record = users.get(id);
  if (!record) return null;
  record.roles = normalizeRoles(roles);
  return publicView(record);
}

function deactivateUser(id) {
  const record = users.get(id);
  if (!record) return null;
  record.status = 'deactivated';
  record.deactivatedAt = new Date().toISOString();
  return publicView(record);
}

function reactivateUser(id) {
  const record = users.get(id);
  if (!record) return null;
  record.status = 'active';
  delete record.deactivatedAt;
  return publicView(record);
}

function authenticate(email, password) {
  const record = findByEmail(email);
  const candidate = typeof password === 'string' ? password : '';
  const matches = verifyPassword(candidate, record ? record.passwordHash : DUMMY_HASH);
  if (!record || !matches) return { ok: false, reason: 'invalid_credentials' };
  if (record.status !== 'active') return { ok: false, reason: 'deactivated' };
  record.lastActive = new Date().toISOString();
  return { ok: true, user: publicView(record) };
}

function canManageUsers(roles) {
  return Array.isArray(roles) && MANAGER_ROLES.some((r) => roles.includes(r));
}

module.exports = {
  UserValidationError,
  createUser,
  getUser,
  getUserByEmail,
  listUsers,
  updateRoles,
  deactivateUser,
  reactivateUser,
  authenticate,
  canManageUsers,
};
