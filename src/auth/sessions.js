const crypto = require('crypto');
const usersStore = require('../users/store');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const sessions = new Map();

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function tokenFromRequest(req) {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  return match ? match[1] : null;
}

function destroySession(token) {
  sessions.delete(token);
}

function authenticatedUser(req) {
  const token = tokenFromRequest(req);
  const session = token ? sessions.get(token) : null;
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = usersStore.getUser(session.userId);
  return user && user.status === 'active' ? user : null;
}

module.exports = { SESSION_TTL_MS, createSession, destroySession, tokenFromRequest, authenticatedUser };
