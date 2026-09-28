const crypto = require('crypto');

const guests = new Map();

class GuestValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

function assertValid(name, email, phone) {
  if (!name) {
    throw new GuestValidationError('name is required');
  }
  if (!email && !phone) {
    throw new GuestValidationError('at least one of email or phone is required');
  }
}

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

module.exports = {
  GuestValidationError,
  createGuest,
  getGuest,
  listGuests,
  updateGuest,
  deactivateGuest,
  reactivateGuest,
};
