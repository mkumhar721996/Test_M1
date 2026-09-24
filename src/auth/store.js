const crypto = require('crypto');
const notifyClient = require('./notifyClient');

const EMAIL_TTL_MINUTES = 15;
const SMS_TTL_MINUTES = 10;

const PASSWORD_RULES = {
  len: (v) => v.length >= 8,
  upper: (v) => /[A-Z]/.test(v),
  lower: (v) => /[a-z]/.test(v),
  num: (v) => /[0-9]/.test(v),
  special: (v) => /[!@#$%^&*]/.test(v),
};

function passwordMeetsComplexity(password) {
  return Object.values(PASSWORD_RULES).every((rule) => rule(password || ''));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

let users;
let resetCredentials;

function seed() {
  users = new Map();
  resetCredentials = new Map();
  users.set('user_4410', {
    id: 'user_4410',
    email: 'works@example.com',
    phone: '+1 555 010 0100',
    passwordHash: hashPassword('OldPassw0rd!'),
  });
}

seed();

function _resetForTests() {
  seed();
}

function detectChannel(contact) {
  return (contact || '').includes('@') ? 'email' : 'phone';
}

function findUserByContact(contact) {
  return Array.from(users.values()).find((u) => u.email === contact || u.phone === contact);
}

async function requestPasswordReset(contact) {
  const channel = detectChannel(contact);
  const user = findUserByContact(contact);

  if (user) {
    const credential = crypto.randomUUID();
    const ttlMinutes = channel === 'email' ? EMAIL_TTL_MINUTES : SMS_TTL_MINUTES;
    resetCredentials.set(credential, {
      userId: user.id,
      channel,
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
      usedAt: null,
    });

    if (channel === 'email') {
      await notifyClient.sendResetEmail({ to: contact, credential, ttlMinutes });
    } else {
      await notifyClient.sendResetSms({ to: contact, credential, ttlMinutes });
    }
  }

  return { channel };
}

function verifyResetCredential(credential) {
  const entry = resetCredentials.get(credential);
  if (!entry) return { valid: false };
  if (entry.usedAt) return { valid: false };
  if (Date.now() > entry.expiresAt) return { valid: false };
  return { valid: true };
}

function resetPassword(credential, newPassword, confirmPassword) {
  const { valid } = verifyResetCredential(credential);
  if (!valid) {
    throw Object.assign(new Error('invalid_or_expired'), { code: 'invalid_or_expired' });
  }
  if (!passwordMeetsComplexity(newPassword)) {
    throw Object.assign(new Error('weak_password'), { code: 'weak_password' });
  }
  if (newPassword !== confirmPassword) {
    throw Object.assign(new Error('password_mismatch'), { code: 'password_mismatch' });
  }

  const entry = resetCredentials.get(credential);
  const user = users.get(entry.userId);
  user.passwordHash = hashPassword(newPassword);
  entry.usedAt = Date.now();

  return { success: true };
}

function verifyLogin(contact, password) {
  const user = findUserByContact(contact);
  if (!user) return false;
  return verifyPassword(password, user.passwordHash);
}

module.exports = {
  detectChannel,
  findUserByContact,
  requestPasswordReset,
  verifyResetCredential,
  resetPassword,
  verifyLogin,
  passwordMeetsComplexity,
  _resetForTests,
};
