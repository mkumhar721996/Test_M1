const crypto = require('crypto');

const guests = new Map();

guests.set('gst_1005', { id: 'gst_1005', name: 'Jordan Lee', email: 'jordan.lee@example.com', phone: '(555) 123-4567' });
guests.set('gst_1006', { id: 'gst_1006', name: 'Priya Nandakumar', email: 'priya.n@example.com', phone: '(555) 987-6543' });
guests.set('gst_1007', { id: 'gst_1007', name: 'Sam Okafor', email: 'sam.okafor@example.com', phone: '(555) 456-7890' });

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

function normalizeEmail(v) {
  return v.trim().toLowerCase();
}

function normalizePhone(v) {
  return v.replace(/\D/g, '');
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidPhone(v) {
  return normalizePhone(v).length >= 7;
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

  const fields = {};

  if (name === '') fields.name = "Enter the guest's full name.";

  let emailError = email !== '' && !isValidEmail(email) ? 'Enter a valid email address.' : '';
  let phoneError = phone !== '' && !isValidPhone(phone) ? 'Enter a valid phone number.' : '';

  if (email === '' && phone === '') {
    emailError = emailError || 'Add an email or phone number so we can check for existing profiles.';
    phoneError = phoneError || 'Add an email or phone number so we can check for existing profiles.';
  }

  if (emailError) fields.email = emailError;
  if (phoneError) fields.phone = phoneError;

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
};
