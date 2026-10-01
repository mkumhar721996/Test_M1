const crypto = require('crypto');
const { getUser } = require('./store');

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 8 * 60 * 60 * 1000;
const BEARER_PATTERN = /^Bearer (\S+)$/;

const sessions = new Map();

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function tokenFromRequest(req) {
  const match = BEARER_PATTERN.exec(req.get('authorization') || '');
  return match ? match[1] : null;
}

function authenticatedUser(req) {
  const token = tokenFromRequest(req);
  const session = token && sessions.get(token);
  if (!session) return null;

  const user = getUser(session.userId);
  if (session.expiresAt <= Date.now() || !user || user.status !== 'active') {
    sessions.delete(token);
    return null;
  }
  return user;
}

module.exports = { SESSION_TTL_MS, createSession, destroySession, tokenFromRequest, authenticatedUser };
