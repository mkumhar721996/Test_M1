/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'users.html');
const ROLES_REQUIRED_COPY = 'Select at least one role so this account has permissions to sign in with.';

function fixtureUser(overrides) {
  return Object.assign({
    id: 'usr_001',
    name: 'Priya Shah',
    email: 'priya.shah@company.com',
    roles: ['admin', 'finance'],
    status: 'active',
    lastActive: '2026-09-29T15:12:00.000Z',
    createdAt: '2025-03-10T09:00:00.000Z',
  }, overrides);
}

const PRIYA = fixtureUser();
const MORGAN = fixtureUser({ id: 'usr_002', name: 'Morgan Ellis', email: 'morgan.ellis@company.com', roles: ['employee'] });
const ELENA = fixtureUser({
  id: 'usr_004',
  name: 'Elena Brooks',
  email: 'elena.brooks@company.com',
  roles: ['employee', 'finance'],
  status: 'deactivated',
  deactivatedAt: '2026-06-10T09:30:00.000Z',
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function submitUserForm() {
  document.getElementById('user-form').dispatchEvent(new Event('submit', { cancelable: true }));
}

function rowFor(name) {
  return Array.from(document.querySelectorAll('#user-tbody tr')).find((tr) => tr.textContent.includes(name));
}

describe('User & role management UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC2: every account in the list is rendered with its roles and status', () => {
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA, MORGAN], {});
    const text = document.getElementById('user-tbody').textContent;
    expect(text).toContain('Priya Shah');
    expect(text).toContain('Morgan Ellis');
    expect(rowFor('Priya Shah').textContent).toContain('Admin');
    expect(rowFor('Priya Shah').textContent).toContain('Finance');
    expect(rowFor('Morgan Ellis').textContent).toContain('Active');
  });

  test('AC9: a deactivated account is shown with a clear Deactivated indicator', () => {
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA, ELENA], {});
    expect(document.querySelector('.user-table').textContent).toContain('Deactivated');
    expect(rowFor('Elena Brooks').querySelector('.status-chip--deactivated')).not.toBeNull();
    expect(rowFor('Elena Brooks').querySelector('[data-action="toggle-status"]').textContent).toBe('Reactivate');
  });

  test('AC1/AC2 UI: creating a user with a role calls the api and the new account appears at the top', async () => {
    const created = fixtureUser({ id: 'usr_100', name: 'Jordan Avery', email: 'jordan.avery@company.com', roles: ['employee'], temporaryPassword: 'fake-temp-password' });
    const api = { create: jest.fn().mockResolvedValue(created) };
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA], api);
    document.getElementById('new-user-btn').click();
    document.getElementById('user-name-input').value = 'Jordan Avery';
    document.getElementById('user-email-input').value = 'jordan.avery@company.com';
    document.querySelector('#role-checklist input[value="employee"]').checked = true;
    submitUserForm();
    await flush();
    expect(api.create).toHaveBeenCalledWith({ name: 'Jordan Avery', email: 'jordan.avery@company.com', roles: ['employee'] });
    expect(document.querySelector('#user-tbody tr').textContent).toContain('Jordan Avery');
    expect(document.getElementById('user-modal-wrap').hidden).toBe(true);
    expect(document.getElementById('toast-root').textContent).toContain('Account created — Jordan Avery can now sign in.');
  });

  test('creating an account shows its temporary password once, and dismissing the note clears it from the page', async () => {
    const created = fixtureUser({ id: 'usr_100', name: 'Jordan Avery', email: 'jordan.avery@company.com', roles: ['employee'], temporaryPassword: 'fake-temp-password' });
    const api = { create: jest.fn().mockResolvedValue(created) };
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA], api);
    document.getElementById('new-user-btn').click();
    document.getElementById('user-name-input').value = 'Jordan Avery';
    document.getElementById('user-email-input').value = 'jordan.avery@company.com';
    document.querySelector('#role-checklist input[value="employee"]').checked = true;
    submitUserForm();
    await flush();
    expect(document.getElementById('um-temp-password').hidden).toBe(false);
    expect(document.getElementById('um-temp-password-value').textContent).toBe('fake-temp-password');
    expect(document.getElementById('user-tbody').textContent).not.toContain('fake-temp-password');
    document.getElementById('um-temp-password-dismiss').click();
    expect(document.getElementById('um-temp-password').hidden).toBe(true);
    expect(document.getElementById('um-temp-password-value').textContent).toBe('');
  });

  test('AC3 UI: creating with no role shows the roles error, keeps typed values and never calls the api', () => {
    const api = { create: jest.fn() };
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA], api);
    document.getElementById('new-user-btn').click();
    document.getElementById('user-name-input').value = 'No Role';
    document.getElementById('user-email-input').value = 'no.role@company.com';
    submitUserForm();
    expect(document.getElementById('roles-error').hidden).toBe(false);
    expect(document.getElementById('roles-error').textContent).toContain(ROLES_REQUIRED_COPY);
    expect(document.getElementById('user-name-input').value).toBe('No Role');
    expect(document.getElementById('user-modal-wrap').hidden).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });

  test('a server validation error on email is shown inline and keeps the modal open', async () => {
    const api = { create: jest.fn().mockRejectedValue({ status: 400, body: { error: 'validation_error', fields: { email: 'An account with this email already exists.' } } }) };
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA], api);
    document.getElementById('new-user-btn').click();
    document.getElementById('user-name-input').value = 'Dupe';
    document.getElementById('user-email-input').value = 'priya.shah@company.com';
    document.querySelector('#role-checklist input[value="employee"]').checked = true;
    submitUserForm();
    await flush();
    expect(document.getElementById('email-error').hidden).toBe(false);
    expect(document.getElementById('email-error').textContent).toContain('already exists');
    expect(document.getElementById('user-modal-wrap').hidden).toBe(false);
  });

  test('AC5 UI: editing roles pre-fills the checklist and saves the new roles to the same account', async () => {
    const updated = { ...MORGAN, roles: ['employee', 'finance'] };
    const api = { setRoles: jest.fn().mockResolvedValue(updated) };
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA, MORGAN], api);
    rowFor('Morgan Ellis').querySelector('[data-action="edit"]').click();
    expect(document.querySelector('#role-checklist input[value="employee"]').checked).toBe(true);
    expect(document.querySelector('#role-checklist input[value="finance"]').checked).toBe(false);
    document.querySelector('#role-checklist input[value="finance"]').checked = true;
    submitUserForm();
    await flush();
    expect(api.setRoles).toHaveBeenCalledWith('usr_002', ['employee', 'finance']);
    expect(rowFor('Morgan Ellis').textContent).toContain('Finance');
    expect(document.querySelectorAll('#user-tbody tr')).toHaveLength(2);
    expect(document.getElementById('toast-root').textContent).toContain('changes apply on their next action');
  });

  test('AC5 UI: unchecking every role while editing is blocked with the same inline error', () => {
    const api = { setRoles: jest.fn() };
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA, MORGAN], api);
    rowFor('Morgan Ellis').querySelector('[data-action="edit"]').click();
    document.querySelector('#role-checklist input[value="employee"]').checked = false;
    submitUserForm();
    expect(document.getElementById('roles-error').hidden).toBe(false);
    expect(api.setRoles).not.toHaveBeenCalled();
  });

  test('AC7/AC8 UI: deactivating asks for confirmation naming both consequences, then marks the row Deactivated', async () => {
    const deactivated = { ...MORGAN, status: 'deactivated', deactivatedAt: '2026-09-30T00:00:00.000Z' };
    const api = { deactivate: jest.fn().mockResolvedValue(deactivated) };
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA, MORGAN], api);
    rowFor('Morgan Ellis').querySelector('[data-action="toggle-status"]').click();
    const body = document.getElementById('deactivate-modal-body').textContent;
    expect(body).toContain('no longer be able to sign in');
    expect(body).toContain('remain visible as read-only history');
    expect(api.deactivate).not.toHaveBeenCalled();
    document.getElementById('deactivate-confirm-btn').click();
    await flush();
    expect(api.deactivate).toHaveBeenCalledWith('usr_002');
    expect(rowFor('Morgan Ellis').textContent).toContain('Deactivated');
    expect(document.getElementById('deactivate-modal-wrap').hidden).toBe(true);
  });

  test('cancelling the deactivate confirmation leaves the account active and does not call the api', () => {
    const api = { deactivate: jest.fn() };
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA, MORGAN], api);
    rowFor('Morgan Ellis').querySelector('[data-action="toggle-status"]').click();
    document.getElementById('deactivate-cancel-btn').click();
    expect(document.getElementById('deactivate-modal-wrap').hidden).toBe(true);
    expect(api.deactivate).not.toHaveBeenCalled();
    expect(rowFor('Morgan Ellis').textContent).toContain('Active');
  });

  test('reactivating a deactivated account calls the api and restores Active', async () => {
    const api = { reactivate: jest.fn().mockResolvedValue({ ...ELENA, status: 'active', deactivatedAt: null }) };
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA, ELENA], api);
    rowFor('Elena Brooks').querySelector('[data-action="toggle-status"]').click();
    await flush();
    expect(api.reactivate).toHaveBeenCalledWith('usr_004');
    expect(rowFor('Elena Brooks').querySelector('.status-chip--active')).not.toBeNull();
  });

  test('search filters by name or email across active and deactivated accounts and shows the empty state', () => {
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA, MORGAN, ELENA], {});
    const search = document.getElementById('user-search-input');
    search.value = 'elena';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#user-tbody tr')).toHaveLength(1);
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    expect(document.getElementById('um-empty').hidden).toBe(false);
    expect(document.querySelector('#um-empty .empty-query').textContent).toBe('zzz');
    document.getElementById('um-clear-search-btn').click();
    expect(document.getElementById('um-empty').hidden).toBe(true);
    expect(document.querySelectorAll('#user-tbody tr')).toHaveLength(3);
  });

  test('AC10 UI: a 403 shows the access-denied panel with the server message and no sign-in link', async () => {
    const api = { list: jest.fn().mockRejectedValue({ status: 403, body: { error: 'forbidden', message: 'User & role management is limited to Admin and Finance accounts.' } }) };
    const { initUsersApp } = require('../public/js/users');
    const app = initUsersApp(document, [], api, { name: 'Morgan Ellis', roles: ['employee'] });
    await app.reload();
    expect(document.getElementById('um-access-denied').hidden).toBe(false);
    expect(document.getElementById('um-access-denied-copy').textContent).toContain('limited to Admin and Finance');
    expect(document.getElementById('um-content').hidden).toBe(true);
    expect(document.getElementById('um-signin-link').hidden).toBe(true);
  });

  test('a 401 asks the visitor to sign in and links to the sign-in page', async () => {
    const api = { list: jest.fn().mockRejectedValue({ status: 401, body: { error: 'unauthorized', message: 'Sign in to continue.' } }) };
    const { initUsersApp } = require('../public/js/users');
    const app = initUsersApp(document, [], api, null);
    await app.reload();
    expect(document.getElementById('um-access-denied').hidden).toBe(false);
    expect(document.getElementById('um-access-denied-copy').textContent).toBe('Sign in to continue.');
    expect(document.getElementById('um-signin-link').hidden).toBe(false);
    expect(document.getElementById('um-signin-link').getAttribute('href')).toBe('./signin.html');
    expect(document.getElementById('um-content').hidden).toBe(true);
  });

  test('AC6 UI: a 403 on a mutation re-checks access, so a demoted admin is shown the denied panel', async () => {
    const api = {
      deactivate: jest.fn().mockRejectedValue({ status: 403, body: { error: 'forbidden', message: 'Denied.' } }),
      list: jest.fn().mockRejectedValue({ status: 403, body: { error: 'forbidden', message: 'Denied.' } }),
    };
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA, MORGAN], api);
    rowFor('Morgan Ellis').querySelector('[data-action="toggle-status"]').click();
    document.getElementById('deactivate-confirm-btn').click();
    await flush();
    expect(api.list).toHaveBeenCalled();
    expect(document.getElementById('um-access-denied').hidden).toBe(false);
    expect(document.getElementById('deactivate-modal-wrap').hidden).toBe(true);
  });

  test('the top bar shows the signed-in account instead of a switchable picker', () => {
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA], {}, { name: 'Priya Shah', roles: ['admin', 'finance'] });
    expect(document.getElementById('viewer-select')).toBeNull();
    expect(document.getElementById('viewer-name').textContent).toBe('Priya Shah');
  });

  test('without a signed-in account the top bar says so', () => {
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [], {}, null);
    expect(document.getElementById('viewer-name').textContent).toBe('Not signed in');
  });

  test('a non-permission load failure shows the error state with a retry that reloads the list', async () => {
    const api = { list: jest.fn().mockRejectedValueOnce({ status: 500, body: {} }).mockResolvedValueOnce([PRIYA]) };
    const { initUsersApp } = require('../public/js/users');
    const app = initUsersApp(document, [], api, { name: 'Priya Shah', roles: ['admin'] });
    await app.reload();
    expect(document.getElementById('um-error').hidden).toBe(false);
    document.getElementById('um-retry-btn').click();
    await flush();
    expect(document.getElementById('um-error').hidden).toBe(true);
    expect(document.getElementById('user-tbody').textContent).toContain('Priya Shah');
  });

  test('Escape closes an open modal', () => {
    const { initUsersApp } = require('../public/js/users');
    initUsersApp(document, [PRIYA], {});
    document.getElementById('new-user-btn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('user-modal-wrap').hidden).toBe(true);
  });
});

describe('createDefaultApi', () => {
  afterEach(() => { delete global.fetch; });

  test('sends the bearer token read at request time, never a role header', async () => {
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    const { createDefaultApi } = require('../public/js/users');
    let token = 'fake-token-one';
    const api = createDefaultApi(() => token);
    await api.list();
    token = 'fake-token-two';
    await api.deactivate('usr_002');
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer fake-token-one');
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fake-token-two');
    expect(global.fetch.mock.calls[1][0]).toBe('/users/usr_002/deactivate');
    expect(global.fetch.mock.calls[0][1].headers).not.toHaveProperty('x-staff-role');
  });

  test('sends no Authorization header when there is no session token', async () => {
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    const { createDefaultApi } = require('../public/js/users');
    await createDefaultApi(() => null).list();
    expect(global.fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  test('rejects with status and body when the server refuses', async () => {
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ error: 'unauthorized' }) });
    const { createDefaultApi } = require('../public/js/users');
    await expect(createDefaultApi(() => null).list()).rejects.toEqual({ status: 401, body: { error: 'unauthorized' } });
  });
});
