const crypto = require('crypto');
const { normalizeEmail, normalizePhone, validateFields } = require('./validation');

const SEED_GUESTS = [
  { id: 'gst_1005', name: 'Jordan Lee', email: 'jordan.lee@example.com', phone: '(555) 123-4567' },
  { id: 'gst_1006', name: 'Priya Nandakumar', email: 'priya.n@example.com', phone: '(555) 987-6543' },
  { id: 'gst_1007', name: 'Sam Okafor', email: 'sam.okafor@example.com', phone: '(555) 456-7890' },
];

const guests = new Map();

function resetStore() {
  guests.clear();
  SEED_GUESTS.forEach((g) => guests.set(g.id, { ...g }));
}

resetStore();

const ROLE_PERMISSIONS = {
  front_desk: true,
  housekeeping: false,
};

function canCreateGuest(role) {
  return ROLE_PERMISSIONS[role] === true;
}

class ValidationError extends Error {
  constructor(fields) {
    super('validation_error');
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

function findGuestMatch({ email, phone } = {}) {
  const nEmail = email ? normalizeEmail(email) : '';
  const nPhone = phone ? normalizePhone(phone) : '';
  return Array.from(guests.values()).find((g) =>
    (nEmail && normalizeEmail(g.email) === nEmail) ||
    (nPhone && normalizePhone(g.phone) === nPhone)
  );
}

function createGuest(data) {
  const name = (data.name || '').trim();
  const email = (data.email || '').trim();
  const phone = (data.phone || '').trim();

  const fields = validateFields({ name, email, phone });

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  const guest = { id: crypto.randomUUID(), name, email, phone };
  guests.set(guest.id, guest);
  return guest;
}

function getGuest(id) {
  return guests.get(id);
}

function listGuests() {
  return Array.from(guests.values());
}

module.exports = {
  ROLE_PERMISSIONS,
  canCreateGuest,
  ValidationError,
  createGuest,
  getGuest,
  listGuests,
  findGuestMatch,
  resetStore,
};
