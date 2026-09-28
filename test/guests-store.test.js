const { searchGuests } = require('../src/guests/store');

test('AC1: a partial name returns every guest profile whose name contains that substring', () => {
  expect(searchGuests({ query: 'Amara', includeInactive: true }).map((g) => g.name).sort())
    .toEqual(['Amara Chen', 'Amara Osei', 'Amara Whitfield']);
});

test('AC2: a complete email returns only the exact profile, never a partial match', () => {
  expect(searchGuests({ query: 'priya.raman@example.com' })).toHaveLength(1);
  expect(searchGuests({ query: 'priya.raman@example.com' })[0].name).toBe('Priya Raman');
  expect(searchGuests({ query: 'priya.raman' })).toEqual([]);
});

test('AC2: a complete phone number returns only the exact profile, never a partial match', () => {
  expect(searchGuests({ query: '(206) 555-0110' })).toHaveLength(1);
  expect(searchGuests({ query: '(206) 555-0110' })[0].name).toBe('Amara Chen');
  expect(searchGuests({ query: '555-0110' })).toEqual([]);
});

test('AC3: a query matching no profiles returns an empty array', () => {
  expect(searchGuests({ query: 'Zzyzx', includeInactive: true })).toEqual([]);
});

test('AC6: a guest with no active reservation is still returned by name, email, or phone', () => {
  expect(searchGuests({ query: 'Priya' }).map((g) => g.name)).toContain('Priya Raman');
  expect(searchGuests({ query: 'priya.raman@example.com' })[0].name).toBe('Priya Raman');
  expect(searchGuests({ query: '(646) 555-0173' })[0].name).toBe('Priya Raman');
});

test('AC7: a default search excludes deactivated profiles', () => {
  expect(searchGuests({ query: 'Amara' }).map((g) => g.name).sort())
    .toEqual(['Amara Chen', 'Amara Whitfield']);
});

test('AC8: the "include inactive" filter adds deactivated profiles to the results', () => {
  expect(searchGuests({ query: 'Amara', includeInactive: true }).map((g) => g.name))
    .toContain('Amara Osei');
});

test('AC9: each result includes full name, email, phone, and active/inactive status', () => {
  expect(searchGuests({ query: 'priya.raman@example.com' })[0]).toMatchObject({
    name: 'Priya Raman', email: 'priya.raman@example.com', phone: '(646) 555-0173', status: 'active',
  });
  expect(searchGuests({ query: 'Amara', includeInactive: true }).find((g) => g.name === 'Amara Osei'))
    .toMatchObject({ status: 'inactive' });
});

test('AC10: a search against the fixture-sized directory returns well within the 2s SLA', () => {
  const started = Date.now();
  searchGuests({ query: 'a', includeInactive: true });
  expect(Date.now() - started).toBeLessThan(500);
});

test('a blank query returns no results', () => {
  expect(searchGuests({ query: '   ' })).toEqual([]);
  expect(searchGuests()).toEqual([]);
});

test('edge case: name matching is case-insensitive', () => {
  expect(searchGuests({ query: 'amara whitfield' }).map((g) => g.name)).toEqual(['Amara Whitfield']);
  expect(searchGuests({ query: 'PRIYA' }).map((g) => g.name)).toEqual(['Priya Raman']);
});

test('edge case: email matching is case-insensitive but still exact, not partial', () => {
  expect(searchGuests({ query: 'PRIYA.RAMAN@EXAMPLE.COM' })[0].name).toBe('Priya Raman');
  expect(searchGuests({ query: 'priya.raman@example.co' })).toEqual([]);
  expect(searchGuests({ query: 'xpriya.raman@example.com' })).toEqual([]);
});

test('edge case: phone matching ignores formatting differences (spaces, dashes, parens, dots, plus)', () => {
  expect(searchGuests({ query: '2065550110' })[0].name).toBe('Amara Chen');
  expect(searchGuests({ query: '+1 206.555.0110' })[0].name).toBe('Amara Chen');
  expect(searchGuests({ query: '206-555-0110' })[0].name).toBe('Amara Chen');
});

test('edge case: a numeric string shorter than 7 digits is treated as a name search, not a phone query', () => {
  expect(searchGuests({ query: '55501' })).toEqual([]);
});

test('edge case: a query containing "@" but not a full email is treated as a name search, not an email query', () => {
  expect(searchGuests({ query: 'amara.chen@' })).toEqual([]);
});

test('edge case: leading/trailing whitespace is trimmed before matching', () => {
  expect(searchGuests({ query: '   Amara Chen   ' }).map((g) => g.name)).toEqual(['Amara Chen']);
  expect(searchGuests({ query: '  priya.raman@example.com  ' })[0].name).toBe('Priya Raman');
});

test('edge case: a name query with no matches at all (including inactive) returns an empty array', () => {
  expect(searchGuests({ query: 'Nonexistent Guest', includeInactive: true })).toEqual([]);
});

test('edge case: an unknown but well-formed email returns no results, never a fallback name match', () => {
  expect(searchGuests({ query: 'nobody@example.com', includeInactive: true })).toEqual([]);
});

test('edge case: an unknown but well-formed phone number returns no results, never a fallback name match', () => {
  expect(searchGuests({ query: '(999) 555-0000', includeInactive: true })).toEqual([]);
});
