/** @jest-environment jsdom */
const { mountGuestInlineHook, createDefaultApi } = require('../public/js/guest-inline-hook');

function makeApi(overrides = {}) {
  return {
    checkPermission: jest.fn().mockResolvedValue({ allowed: true }),
    checkMatch: jest.fn().mockResolvedValue(null),
    createGuest: jest.fn().mockResolvedValue({ ok: true, guest: { id: 'gst_new', name: 'Alex Rivera' } }),
    ...overrides,
  };
}

function mount(api) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const onLinked = jest.fn();
  const onEvent = jest.fn();
  const hook = mountGuestInlineHook(container, { role: 'front_desk', api, onLinked, onEvent });
  return { container, hook, onLinked, onEvent };
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.useRealTimers();
});

test('AC1: submitting the form creates a guest without a full-page navigation', async () => {
  const api = makeApi();
  const { container, hook, onLinked } = mount(api);
  await hook.open();

  container.querySelector('#field-name').value = 'Alex Rivera';
  container.querySelector('#field-email').value = 'alex@example.com';

  const form = container.querySelector('#hook-form');
  const submitEvent = new Event('submit', { cancelable: true });
  form.dispatchEvent(submitEvent);

  expect(submitEvent.defaultPrevented).toBe(true);

  await Promise.resolve();
  await Promise.resolve();

  expect(onLinked).toHaveBeenCalledWith(expect.objectContaining({ source: 'created' }));
  expect(document.body.contains(container)).toBe(true);
});

test('AC2: typing a matching email surfaces the duplicate profile and selecting it links without creating', async () => {
  jest.useFakeTimers();
  const match = { id: 'gst_1005', name: 'Jordan Lee', email: 'jordan.lee@example.com' };
  const api = makeApi({ checkMatch: jest.fn().mockResolvedValue(match) });
  const { container, hook, onLinked } = mount(api);
  await hook.open();

  const fieldEmail = container.querySelector('#field-email');
  fieldEmail.value = 'jordan.lee@example.com';
  fieldEmail.dispatchEvent(new Event('input'));

  jest.advanceTimersByTime(350);
  await Promise.resolve();
  await Promise.resolve();

  expect(api.checkMatch).toHaveBeenCalledWith({ email: 'jordan.lee@example.com', phone: '' });
  expect(container.querySelector('#dup-match').hidden).toBe(false);

  container.querySelector('#use-match-btn').click();

  expect(onLinked).toHaveBeenCalledWith({ guestId: 'gst_1005', displayName: 'Jordan Lee', source: 'existing' });
  expect(api.createGuest).not.toHaveBeenCalled();
});

test('AC3: a successful create returns a stable identifier to the embedding context', async () => {
  const api = makeApi({ createGuest: jest.fn().mockResolvedValue({ ok: true, guest: { id: 'gst_stable', name: 'Alex Rivera' } }) });
  const { container, hook, onLinked } = mount(api);
  await hook.open();

  container.querySelector('#field-name').value = 'Alex Rivera';
  container.querySelector('#field-email').value = 'alex@example.com';
  container.querySelector('#hook-form').dispatchEvent(new Event('submit', { cancelable: true }));

  await Promise.resolve();
  await Promise.resolve();

  expect(onLinked).toHaveBeenCalledWith({ guestId: 'gst_stable', displayName: 'Alex Rivera', source: 'created' });
});

test('AC4: a blank name fails client-side validation and never calls the API', async () => {
  const api = makeApi();
  const { container, hook } = mount(api);
  await hook.open();

  container.querySelector('#field-email').value = 'alex@example.com';
  container.querySelector('#hook-form').dispatchEvent(new Event('submit', { cancelable: true }));

  expect(container.querySelector('#error-name').hidden).toBe(false);
  expect(api.createGuest).not.toHaveBeenCalled();
});

test('AC4: a server-side validation error renders structured per-field messages', async () => {
  const api = makeApi({
    createGuest: jest.fn().mockResolvedValue({ ok: false, kind: 'validation', fields: { email: 'Enter a valid email address.' } }),
  });
  const { container, hook } = mount(api);
  await hook.open();

  container.querySelector('#field-name').value = 'Alex Rivera';
  container.querySelector('#field-phone').value = '555-123-4567';
  container.querySelector('#hook-form').dispatchEvent(new Event('submit', { cancelable: true }));

  await Promise.resolve();
  await Promise.resolve();

  const errorEmail = container.querySelector('#error-email');
  expect(errorEmail.hidden).toBe(false);
  expect(errorEmail.textContent).toContain('valid email');
});

test('AC5: a service error leaves typed values untouched and never links a guest', async () => {
  const api = makeApi({ createGuest: jest.fn().mockResolvedValue({ ok: false, kind: 'service_error' }) });
  const { container, hook, onLinked, onEvent } = mount(api);
  await hook.open();

  container.querySelector('#field-name').value = 'Alex Rivera';
  container.querySelector('#field-email').value = 'alex@example.com';
  container.querySelector('#hook-form').dispatchEvent(new Event('submit', { cancelable: true }));

  await Promise.resolve();
  await Promise.resolve();

  expect(container.querySelector('#service-error-notice').hidden).toBe(false);
  expect(container.querySelector('#field-name').value).toBe('Alex Rivera');
  expect(onLinked).not.toHaveBeenCalled();
  expect(onEvent).toHaveBeenCalledWith('guest.service_error', { reason: 'network_error', persisted: false });
});

test('mounting without an api throws instead of crashing later on first interaction', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  expect(() => mountGuestInlineHook(container, { role: 'front_desk' })).toThrow(/requires an api object/);
});

test('a rejected checkPermission call fails closed (shows permission-denied, never throws unhandled)', async () => {
  const api = makeApi({ checkPermission: jest.fn().mockRejectedValue(new Error('network down')) });
  const { container, hook } = mount(api);

  await expect(hook.open()).resolves.toBeUndefined();

  expect(container.querySelector('#permission-denied-notice').hidden).toBe(false);
  expect(container.querySelector('#hook-form').hidden).toBe(true);
});

test('a rejected checkMatch call during duplicate detection does not throw and hides the spinner', async () => {
  jest.useFakeTimers();
  const api = makeApi({ checkMatch: jest.fn().mockRejectedValue(new Error('network down')) });
  const { container, hook } = mount(api);
  await hook.open();

  const fieldEmail = container.querySelector('#field-email');
  fieldEmail.value = 'jordan.lee@example.com';
  fieldEmail.dispatchEvent(new Event('input'));

  jest.advanceTimersByTime(350);
  await Promise.resolve();
  await Promise.resolve();

  expect(container.querySelector('#dup-status').hidden).toBe(true);
  expect(container.querySelector('#dup-match').hidden).toBe(true);
});

test('AC6: opening with a denied role shows the permission-denied notice and never renders the form or calls create', async () => {
  const api = makeApi({ checkPermission: jest.fn().mockResolvedValue({ allowed: false }) });
  const { container, hook, onLinked, onEvent } = mount(api);

  await hook.open();

  expect(container.querySelector('#hook-form').hidden).toBe(true);
  expect(container.querySelector('#permission-denied-notice').hidden).toBe(false);
  expect(api.createGuest).not.toHaveBeenCalled();
  expect(onLinked).not.toHaveBeenCalled();
  expect(onEvent).toHaveBeenCalledWith('guest.permission_denied', { reason: 'insufficient_permissions' });
});

describe('createDefaultApi — network failures never reject, they resolve to safe defaults', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('checkPermission resolves to { allowed: false } when the fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const api = createDefaultApi('front_desk');
    await expect(api.checkPermission()).resolves.toEqual({ allowed: false });
  });

  test('checkMatch resolves to null when the fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const api = createDefaultApi('front_desk');
    await expect(api.checkMatch({ email: 'alex@example.com', phone: '' })).resolves.toBeNull();
  });
});
