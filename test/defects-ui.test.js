/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'defects.html');

let initDefectsApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  ({ initDefectsApp } = require('../public/js/defects'));
});

const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };
const page = (items) => ({ items, page: 1, pageSize: 5, totalItems: items.length, totalPages: 1 });
const submit = () => document.getElementById('defect-form').dispatchEvent(new Event('submit', { cancelable: true }));

test('submitting the form with any details creates a defect with status New', async () => {
  const created = { id: 'DEF-1043', title: 'Checkout button unresponsive', description: '', steps: '', environment: '', severity: '', status: 'New', reportedBy: 'Jordan Lee', reportedAt: '2026-10-07' };
  const api = { create: jest.fn().mockResolvedValue(created), list: jest.fn().mockResolvedValue(page([created])) };
  initDefectsApp(document, api);
  await flush();
  document.getElementById('go-to-form').click();
  document.getElementById('field-title').value = 'Checkout button unresponsive';
  submit();
  await flush();
  expect(api.create).toHaveBeenCalled();
  expect(document.getElementById('detail-status-chip').textContent).toContain('New');
  expect(document.querySelectorAll('.defect-row')).toHaveLength(1);
});

test('Details screen shows exactly what was entered; blank optional fields read Not provided', async () => {
  const created = { id: 'DEF-1044', title: 'Bug', description: 'Desc here', steps: '', environment: '', severity: '', status: 'New', reportedBy: 'Jordan Lee', reportedAt: '2026-10-07' };
  const api = { create: jest.fn().mockResolvedValue(created), list: jest.fn().mockResolvedValue(page([created])) };
  initDefectsApp(document, api);
  await flush();
  document.getElementById('go-to-form').click();
  document.getElementById('field-title').value = 'Bug';
  document.getElementById('field-description').value = 'Desc here';
  submit();
  await flush();
  expect(api.create).toHaveBeenCalledWith({ title: 'Bug', description: 'Desc here', steps: '', environment: '', severity: '', reportedBy: 'Jordan Lee' });
  expect(document.getElementById('detail-description').textContent).toBe('Desc here');
  expect(document.getElementById('detail-steps').textContent).toBe('Not provided');
});

test('submitting a completely blank form is rejected client-side and creates nothing', async () => {
  const api = { create: jest.fn(), list: jest.fn().mockResolvedValue(page([])) };
  initDefectsApp(document, api);
  await flush();
  document.getElementById('go-to-form').click();
  submit();
  expect(api.create).not.toHaveBeenCalled();
  expect(document.getElementById('form-error-banner').hidden).toBe(false);
  expect(document.getElementById('title-error').hidden).toBe(false);
  expect(document.activeElement).toBe(document.getElementById('field-title'));
});
