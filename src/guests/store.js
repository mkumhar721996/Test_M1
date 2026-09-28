const guests = new Map();

[
  { id: 'guest_1', name: 'Amara Whitfield', email: 'amara.whitfield@example.com', phone: '(415) 555-0142', status: 'active' },
  { id: 'guest_2', name: 'Amara Chen', email: 'amara.chen@example.com', phone: '(206) 555-0110', status: 'active' },
  { id: 'guest_3', name: 'Daniel Osei', email: 'daniel.osei@example.com', phone: '(312) 555-0199', status: 'inactive' },
  { id: 'guest_4', name: 'Priya Raman', email: 'priya.raman@example.com', phone: '(646) 555-0173', status: 'active' },
  { id: 'guest_5', name: 'Marcus Bell', email: 'marcus.bell@example.com', phone: '(702) 555-0184', status: 'active' },
  { id: 'guest_6', name: 'Sofia Delgado', email: 'sofia.delgado@example.com', phone: '(929) 555-0128', status: 'inactive' },
  { id: 'guest_7', name: 'Wei Zhang', email: 'wei.zhang@example.com', phone: '(503) 555-0165', status: 'active' },
  { id: 'guest_8', name: 'Grace Okafor', email: 'grace.okafor@example.com', phone: '(773) 555-0137', status: 'active' },
  { id: 'guest_9', name: 'Liam Fitzgerald', email: 'liam.fitzgerald@example.com', phone: '(617) 555-0192', status: 'inactive' },
  { id: 'guest_10', name: 'Amara Osei', email: 'amara.osei@example.com', phone: '(404) 555-0151', status: 'inactive' },
].forEach((guest) => guests.set(guest.id, guest));

function digitsOnly(str) {
  return str.replace(/[^\d]/g, '');
}

function normalizePhoneDigits(str) {
  const digits = digitsOnly(str);
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

function isEmailQuery(q) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
}

function isPhoneQuery(q) {
  const stripped = q.replace(/[\s()\-.+]/g, '');
  return stripped.length >= 7 && /^\d+$/.test(stripped);
}

function searchGuests({ query, includeInactive = false } = {}) {
  const trimmed = (query || '').trim();
  if (!trimmed) return [];

  const all = Array.from(guests.values());
  let matches;
  if (isEmailQuery(trimmed)) {
    matches = all.filter((g) => g.email.toLowerCase() === trimmed.toLowerCase());
  } else if (isPhoneQuery(trimmed)) {
    const qDigits = normalizePhoneDigits(trimmed);
    matches = all.filter((g) => normalizePhoneDigits(g.phone) === qDigits);
  } else {
    const needle = trimmed.toLowerCase();
    matches = all.filter((g) => g.name.toLowerCase().includes(needle));
  }

  return includeInactive ? matches : matches.filter((g) => g.status === 'active');
}

module.exports = { searchGuests };
