/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'leave-types.html');
const TYPES = [
  { id: 'annual', name: 'Annual leave', description: 'a', defaultBalance: 15 },
  { id: 'sick', name: 'Sick leave', description: 's', defaultBalance: 10 },
  { id: 'unpaid', name: 'Unpaid leave', description: 'u', defaultBalance: 5 },
];

beforeEach(() => {
  jest.resetModules();
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
});

test('AC1: renders all three fixed types with no management control', async () => {
  const { initLeaveTypesApp } = require('../public/js/leave-types');
  await initLeaveTypesApp(document, { list: jest.fn().mockResolvedValue(TYPES) });
  expect(document.querySelectorAll('.leave-type-card')).toHaveLength(3);
  expect(document.querySelector('.default-balance').textContent).toBe('Default starting balance: 15 days');
  expect(document.querySelector('[id*="add-type" i], [id*="manage-type" i]')).toBeNull();
  expect(Array.from(document.querySelectorAll('#preview-leave-type option')).map((o) => o.textContent))
    .toEqual(['Annual leave', 'Sick leave', 'Unpaid leave']);
});
