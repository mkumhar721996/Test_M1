const { createGuest, deactivateGuest, searchGuests } = require('../src/guests/store');

test('AC1: a partial name returns every guest whose name contains the substring, and only those', () => {
  createGuest({ name: 'Amara Whitfield', email: 'amara.whitfield@example.com', phone: '(415) 555-0142' }, 'Priya Nair');
  createGuest({ name: 'Briana Whitfield', email: 'briana.whitfield@example.com', phone: '(917) 555-0121' }, 'Priya Nair');
  createGuest({ name: 'Marcus Bell', email: 'marcus.bell@example.com', phone: '(702) 555-0184' }, 'Priya Nair');

  expect(searchGuests({ query: 'Whitfield' }).map((g) => g.name).sort())
    .toEqual(['Amara Whitfield', 'Briana Whitfield']);
});

test('AC2: a complete email or phone returns only the exact profile, never a partial match', () => {
  createGuest({ name: 'Priya Raman', email: 'priya.raman@example.com', phone: '(646) 555-0173' }, 'Priya Nair');
  createGuest({ name: 'Priya Anand', email: 'priya.anand@example.com', phone: '(646) 555-0199' }, 'Priya Nair');

  expect(searchGuests({ query: 'priya.raman@example.com' }).map((g) => g.name)).toEqual(['Priya Raman']);
  expect(searchGuests({ query: '(646) 555-0173' }).map((g) => g.name)).toEqual(['Priya Raman']);
});

test('AC3: no matches returns an empty array', () => {
  expect(searchGuests({ query: 'Zzyzx', includeInactive: true })).toEqual([]);
});

test('AC6: a guest is returned whether or not it has an active reservation', () => {
  const g = createGuest({ name: 'Sofia Delgado', email: 'sofia.delgado@example.com', phone: '(929) 555-0128' }, 'Priya Nair');
  expect(g.bookingHistory).toEqual([]);
  expect(searchGuests({ query: 'Sofia Delgado' }).map((r) => r.id)).toContain(g.id);
  expect(searchGuests({ query: 'sofia.delgado@example.com' })[0].id).toBe(g.id);
});

test('AC7: a default search excludes deactivated profiles', () => {
  const active = createGuest({ name: 'Grace Kellerman', email: 'grace.kellerman@example.com', phone: '(773) 555-0137' }, 'Priya Nair');
  const inactive = createGuest({ name: 'Wren Kellerman', email: 'wren.kellerman@example.com', phone: '(773) 555-0140' }, 'Priya Nair');
  deactivateGuest(inactive.id, 'Priya Nair');

  expect(searchGuests({ query: 'Kellerman' }).map((g) => g.id)).toEqual([active.id]);
});

test('AC8: include inactive adds deactivated profiles back', () => {
  const active = createGuest({ name: 'Liam Fitzgerald', email: 'liam.fitzgerald@example.com', phone: '(617) 555-0192' }, 'Priya Nair');
  const inactive = createGuest({ name: 'Noor Fitzgerald', email: 'noor.fitzgerald@example.com', phone: '(617) 555-0193' }, 'Priya Nair');
  deactivateGuest(inactive.id, 'Priya Nair');

  expect(searchGuests({ query: 'Fitzgerald', includeInactive: true }).map((g) => g.id).sort())
    .toEqual([active.id, inactive.id].sort());
});

test('AC9: each result shows full name, email, phone, and active/inactive status', () => {
  const g = createGuest({ name: 'Marisol Bell', email: 'marisol.bell@example.com', phone: '(773) 555-0199' }, 'Priya Nair');
  expect(searchGuests({ query: 'marisol.bell@example.com' })[0])
    .toMatchObject({ id: g.id, name: 'Marisol Bell', email: 'marisol.bell@example.com', phone: '(773) 555-0199', status: 'active' });
});
