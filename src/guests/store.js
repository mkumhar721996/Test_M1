const crypto = require('crypto');

const guests = new Map();

const ROLE_PERMISSIONS = {
  front_desk: true,
  housekeeping: false,
};

function canCreateGuest(role) {
  return ROLE_PERMISSIONS[role] === true;
}

class GuestValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

function normalizeEmail(v) {
  return (v || '').trim().toLowerCase();
}

function normalizePhone(v) {
  return (v || '').replace(/\D/g, '');
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidPhone(v) {
  return normalizePhone(v).length >= 7;
}

function assertValid(name, email, phone) {
  const fields = {};
  if (!name) {
    fields.name = "Enter the guest's full name.";
  }
  if (!email && !phone) {
    fields.email = 'Add an email or phone number so we can check for existing profiles.';
    fields.phone = 'Add an email or phone number so we can check for existing profiles.';
  } else {
    if (email && !isValidEmail(email)) {
      fields.email = 'Enter a valid email address.';
    }
    if (phone && !isValidPhone(phone)) {
      fields.phone = 'Enter a valid phone number.';
    }
  }
  if (Object.keys(fields).length > 0) {
    throw new GuestValidationError('validation_error', fields);
  }
}

function firstQueryValue(v) {
  return Array.isArray(v) ? (v[0] || '') : (v || '');
}

function findGuestMatch({ email, phone } = {}) {
  const emailStr = firstQueryValue(email);
  const phoneStr = firstQueryValue(phone);
  const nEmail = emailStr ? normalizeEmail(emailStr) : '';
  const nPhone = phoneStr ? normalizePhone(phoneStr) : '';
  return Array.from(guests.values()).find((g) =>
    (nEmail && normalizeEmail(g.email) === nEmail) ||
    (nPhone && normalizePhone(g.phone) === nPhone)
  );
}

function seedFixtureGuest({ id, name, email, phone }) {
  const iso = new Date().toISOString();
  guests.set(id, {
    id,
    name,
    email,
    phone,
    status: 'active',
    createdAt: iso,
    updatedAt: iso,
    preferences: { roomType: '', dietary: '', communication: '' },
    bookingHistory: [],
    auditLog: [{ ts: iso, actor: 'system', action: 'seeded fixture profile' }],
  });
}

seedFixtureGuest({ id: 'gst_1005', name: 'Jordan Lee', email: 'jordan.lee@example.com', phone: '(555) 123-4567' });
seedFixtureGuest({ id: 'gst_1006', name: 'Priya Nandakumar', email: 'priya.n@example.com', phone: '(555) 987-6543' });
seedFixtureGuest({ id: 'gst_1007', name: 'Sam Okafor', email: 'sam.okafor@example.com', phone: '(555) 456-7890' });

function createGuest(data, actor) {
  const name = data.name;
  const email = data.email || '';
  const phone = data.phone || '';
  assertValid(name, email, phone);

  const iso = new Date().toISOString();
  const guest = {
    id: crypto.randomUUID(),
    name,
    email,
    phone,
    status: 'active',
    createdAt: iso,
    updatedAt: iso,
    preferences: {
      roomType: data.roomType || '',
      dietary: data.dietary || '',
      communication: data.communication || '',
    },
    bookingHistory: [],
    auditLog: [{ ts: iso, actor, action: 'created profile' }],
  };

  guests.set(guest.id, guest);
  return guest;
}

function getGuest(id) {
  return guests.get(id);
}

function listGuests() {
  return Array.from(guests.values());
}

const PREFERENCE_FIELDS = ['roomType', 'dietary', 'communication'];

function updateGuest(id, changes, actor) {
  const guest = guests.get(id);
  if (!guest) return undefined;

  const nextName = 'name' in changes ? changes.name : guest.name;
  const nextEmail = 'email' in changes ? changes.email : guest.email;
  const nextPhone = 'phone' in changes ? changes.phone : guest.phone;
  assertValid(nextName, nextEmail, nextPhone);

  const changedFields = [];
  if ('name' in changes && changes.name !== guest.name) {
    guest.name = changes.name;
    changedFields.push('name');
  }
  if ('email' in changes && changes.email !== guest.email) {
    guest.email = changes.email;
    changedFields.push('email');
  }
  if ('phone' in changes && changes.phone !== guest.phone) {
    guest.phone = changes.phone;
    changedFields.push('phone');
  }
  PREFERENCE_FIELDS.forEach((field) => {
    if (field in changes && changes[field] !== guest.preferences[field]) {
      guest.preferences[field] = changes[field];
      changedFields.push(field);
    }
  });

  if (changedFields.length === 0) {
    return guest;
  }

  const iso = new Date().toISOString();
  guest.updatedAt = iso;
  guest.auditLog.push({ ts: iso, actor, action: `updated ${changedFields.join(', ')}` });
  return guest;
}

function deactivateGuest(id, actor) {
  const guest = guests.get(id);
  if (!guest) return undefined;

  const iso = new Date().toISOString();
  guest.status = 'deactivated';
  guest.updatedAt = iso;
  guest.auditLog.push({ ts: iso, actor, action: 'deactivated profile' });
  return guest;
}

function reactivateGuest(id, actor) {
  const guest = guests.get(id);
  if (!guest) return undefined;

  const iso = new Date().toISOString();
  guest.status = 'active';
  guest.updatedAt = iso;
  guest.auditLog.push({ ts: iso, actor, action: 'reactivated profile' });
  return guest;
}

function findDuplicateGuests(candidate, guestList) {
  const email = normalizeEmail(candidate.email);
  const phone = normalizePhone(candidate.phone);
  const matches = [];
  guestList.forEach((g) => {
    const reasons = [];
    if (email && normalizeEmail(g.email) === email) reasons.push('email');
    if (phone && normalizePhone(g.phone) === phone) reasons.push('phone');
    if (reasons.length) matches.push({ guest: g, reasons });
  });
  return matches;
}

module.exports = {
  GuestValidationError,
  createGuest,
  getGuest,
  listGuests,
  updateGuest,
  deactivateGuest,
  reactivateGuest,
  canCreateGuest,
  findGuestMatch,
  findDuplicateGuests,
};
