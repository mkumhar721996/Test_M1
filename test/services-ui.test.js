/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'services.html');
const catalog = {
  categories: [
    { id: 'plumbing', name: 'Plumbing', icon: 'P', description: 'Pipes', duration: '1h', fields: [{ id: 'fixture', label: 'Which fixture is affected?', type: 'select', options: ['Sink'] }] },
    { id: 'electrical', name: 'Electrical', icon: 'E', description: 'Wires', duration: '1h', fields: [{ id: 'room', label: 'Which room is affected?', type: 'text' }] },
  ],
  timeWindows: [
    { id: 'morning', label: 'Morning', staffed: true },
    { id: 'evening', label: 'Evening', staffed: false },
  ],
};

let initServicesApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  ({ initServicesApp } = require('../public/js/services'));
});

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const $ = (id) => document.getElementById(id);
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
const setValue = (id, value, type = 'change') => { $(id).value = value; fire($(id), type); };
const submitForm = () => $('booking-form').dispatchEvent(new Event('submit', { cancelable: true }));
const saved = (over = {}) => ({
  id: 'REQ-1', categoryName: 'Plumbing', description: 'Leak', preferredDate: '2026-10-10', timeWindowLabel: 'Morning',
  address: { street: '1 Main', unit: '', city: 'Austin', state: 'TX', zip: '78701' }, photoCount: 0, staffed: true, status: 'Pending', ...over,
});
const makeApi = (over = {}) => ({
  getCatalog: jest.fn().mockResolvedValue(catalog),
  createRequest: jest.fn().mockResolvedValue(saved()),
  listQueue: jest.fn().mockResolvedValue([]),
  ...over,
});
async function openForm(api, categoryId = 'plumbing') {
  initServicesApp(document, api);
  await flush();
  document.querySelector(`[data-request-category="${categoryId}"]`).click();
}
function fillValid(windowId = 'morning') {
  setValue('description', 'Leak', 'input');
  setValue('preferred-date', '2026-10-10', 'input');
  setValue('time-window', windowId);
  setValue('addr-street', '1 Main', 'input');
  setValue('addr-city', 'Austin', 'input');
  setValue('addr-state', 'TX', 'input');
  setValue('addr-zip', '78701', 'input');
  setValue('dyn-fixture', 'Sink');
}

test('AC1: categories render read-only', async () => {
  initServicesApp(document, makeApi());
  await flush();
  expect(document.querySelectorAll('.category-card')).toHaveLength(2);
  expect(document.querySelector('.category-card button[data-edit], .category-card button[data-delete]')).toBeNull();
});

test('AC2: dynamic fields follow the selected category', async () => {
  await openForm(makeApi());
  expect($('dynamic-fields').textContent).toContain('Which fixture is affected?');
  setValue('category-select', 'electrical');
  expect($('dynamic-fields').textContent).not.toContain('Which fixture is affected?');
  expect($('dynamic-fields').textContent).toContain('Which room is affected?');
});

test('AC3: valid submit without photos succeeds', async () => {
  const api = makeApi();
  await openForm(api);
  fillValid();
  submitForm();
  await flush();
  expect(api.createRequest).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'plumbing', photos: [] }));
  expect($('conf-id').textContent).toBe('REQ-1');
  expect($('conf-photos').textContent).toBe('No photos attached');
});

test('AC4: blank required fields show errors and do not submit', async () => {
  const api = makeApi();
  await openForm(api);
  submitForm();
  expect(api.createRequest).not.toHaveBeenCalled();
  expect($('form-error-summary').querySelector('[role="alert"]')).not.toBeNull();
  expect($('description-error').hidden).toBe(false);
  expect($('time-window-error').hidden).toBe(false);
  expect($('address-error').hidden).toBe(false);
});

test('AC5: attached photos are submitted and counted', async () => {
  const api = makeApi({ createRequest: jest.fn().mockResolvedValue(saved({ photoCount: 2 })) });
  await openForm(api);
  fillValid();
  Object.defineProperty($('photo-input'), 'files', { value: [{ name: 'a.jpg' }, { name: 'b.jpg' }], configurable: true });
  fire($('photo-input'), 'change');
  submitForm();
  await flush();
  expect(api.createRequest).toHaveBeenCalledWith(expect.objectContaining({ photos: [{ name: 'a.jpg' }, { name: 'b.jpg' }] }));
  expect($('conf-photos').textContent).toBe('2 photos attached');
});

test('AC7: unstaffed window shows a notice, not an error, and still submits', async () => {
  const api = makeApi({ createRequest: jest.fn().mockResolvedValue(saved({ staffed: false })) });
  await openForm(api);
  setValue('time-window', 'evening');
  expect($('unstaffed-notice').hidden).toBe(false);
  expect($('unstaffed-notice').querySelector('.notice')).not.toBeNull();
  expect($('unstaffed-notice').querySelector('.field-error')).toBeNull();
  fillValid('evening');
  submitForm();
  await flush();
  expect(api.createRequest).toHaveBeenCalled();
  expect($('conf-unstaffed-notice').querySelector('.notice')).not.toBeNull();
});
