/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'users.html');
const INDEX_PATH = path.join(__dirname, '..', 'public', 'index.html');

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
const ELENA = fixtureUser({ id: 'usr_004', name: 'Elena Brooks', email: 'elena.brooks@company.com', roles: ['employee', 'finance'], status: 'deactivated', deactivatedAt: '2026-06-10T09:30:00.000Z' });

const VIEWER = { id: 'usr_001', name: 'Priya Shah' };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function submit(id) {
  document.getElementById(id).dispatchEvent(new Event('submit', { cancelable: true }));
}

function checkRole(role) {
  const box = document.querySelector(`#role-checklist input[value="${role}"]`);
  box.checked = true;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('User & role management UI', () => {
  let initUsersApp;

  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    ({ initUsersApp } = require('../public/js/users'));
  });

  test('the Expenses app shell links to the Users screen', () => {
    expect(fs.readFileSync(INDEX_PATH, 'utf8')).toContain('href="users.html"');
  });

  test('AC9: a deactivated account is listed with a Deactivated status chip and a Reactivate action', () => {
    initUsersApp(document, [PRIYA, ELENA], {}, VIEWER);
    const rows = document.querySelectorAll('#user-tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain('Elena Brooks');
    expect(rows[1].querySelector('.status-chip--deactivated').textContent).toContain('Deactivated');
    expect(rows[1].textContent).toContain('Reactivate');
  });

  test('AC8: every row offers a View history link carrying only the account id', () => {
    initUsersApp(document, [PRIYA, ELENA], {}, VIEWER);
    const link = document.querySelectorAll('#user-tbody tr')[1].querySelector('a');
    expect(link.textContent).toBe('View history');
    expect(link.getAttribute('href')).toBe('user-history.html?id=usr_004');
  });

  test('the Signed in as control shows the signed-in account and is not a switcher', () => {
    initUsersApp(document, [PRIYA], {}, VIEWER);
    const select = document.getElementById('viewer-select');
    expect(select.disabled).toBe(true);
    expect(select.textContent).toBe('Priya Shah');
    expect(select.querySelectorAll('option')).toHaveLength(1);
  });

  test('AC10: when the server denies the signed-in account the access-denied panel replaces the table', async () => {
    const api = {
      list: jest.fn().mockRejectedValue({ status: 403, body: { error: 'forbidden', message: "You don't have permission to manage user accounts" } }),
    };
    const app = initUsersApp(document, [], api, { id: 'usr_002', name: 'Morgan Ellis' });
    await app.refreshForViewer();
    expect(document.getElementById('um-access-denied').hidden).toBe(false);
    expect(document.getElementById('um-content').hidden).toBe(true);
    expect(document.getElementById('um-access-denied-copy').textContent).toContain("You don't have permission");
    expect(document.getElementById('um-signin-link').hidden).toBe(true);
    expect(document.getElementById('user-tbody').textContent).not.toContain('Priya');
  });

  test('AC10: with no valid session the panel asks the visitor to sign in', async () => {
    const api = { list: jest.fn().mockRejectedValue({ status: 401, body: { error: 'unauthorized' } }) };
    const app = initUsersApp(document, [], api, null);
    await app.refreshForViewer();
    expect(document.getElementById('um-access-denied').hidden).toBe(false);
    expect(document.getElementById('um-content').hidden).toBe(true);
    expect(document.getElementById('um-signin-link').hidden).toBe(false);
    expect(document.getElementById('um-access-denied-copy').textContent).toMatch(/sign in/i);
    expect(document.getElementById('viewer-select').textContent).toBe('Not signed in');
  });

  test('a successful refresh re-renders the list from the server', async () => {
    const api = { list: jest.fn().mockResolvedValue([PRIYA, MORGAN]) };
    const app = initUsersApp(document, [], api, VIEWER);
    await app.refreshForViewer();
    expect(document.getElementById('um-access-denied').hidden).toBe(true);
    expect(document.querySelectorAll('#user-tbody tr')).toHaveLength(2);
  });

  test('AC3: submitting the create form with no role checked shows #roles-error and never calls the api', () => {
    const api = { create: jest.fn() };
    initUsersApp(document, [PRIYA], api, VIEWER);
    document.getElementById('new-user-btn').click();
    document.getElementById('user-name-input').value = 'No Role';
    document.getElementById('user-email-input').value = 'no.role@company.com';
    submit('user-form');
    const error = document.getElementById('roles-error');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('Select at least one role');
    expect(document.getElementById('user-modal-wrap').hidden).toBe(false);
    expect(document.getElementById('user-name-input').value).toBe('No Role');
    expect(api.create).not.toHaveBeenCalled();
  });

  test('AC1/AC2: creating with a role calls the api, adds the account to the list, and shows the temporary password', async () => {
    const created = fixtureUser({ id: 'usr_new', name: 'Jordan Avery', email: 'jordan.avery@company.com', roles: ['employee'], temporaryPassword: 'fake-temp-pass' });
    const api = { create: jest.fn().mockResolvedValue(created) };
    initUsersApp(document, [PRIYA], api, VIEWER);
    document.getElementById('new-user-btn').click();
    document.getElementById('user-name-input').value = 'Jordan Avery';
    document.getElementById('user-email-input').value = 'jordan.avery@company.com';
    checkRole('employee');
    submit('user-form');
    await flush();
    expect(api.create).toHaveBeenCalledWith({ name: 'Jordan Avery', email: 'jordan.avery@company.com', roles: ['employee'] });
    expect(document.getElementById('user-tbody').textContent).toContain('Jordan Avery');
    expect(document.getElementById('user-modal-wrap').hidden).toBe(true);
    expect(document.getElementById('temp-password-note').hidden).toBe(false);
    expect(document.getElementById('temp-password-text').textContent).toContain('fake-temp-pass');
    expect(document.getElementById('user-tbody').textContent).not.toContain('fake-temp-pass');
  });

  test('a server-side email error is shown inline and keeps the modal open', async () => {
    const api = { create: jest.fn().mockRejectedValue({ status: 400, body: { fields: { email: 'An account with this email already exists.' } } }) };
    initUsersApp(document, [PRIYA], api, VIEWER);
    document.getElementById('new-user-btn').click();
    checkRole('employee');
    submit('user-form');
    await flush();
    expect(document.getElementById('email-error').hidden).toBe(false);
    expect(document.getElementById('email-error').textContent).toContain('already exists');
    expect(document.getElementById('user-modal-wrap').hidden).toBe(false);
  });

  test('AC5: Edit roles pre-fills the checklist and saving calls updateRoles for the same account', async () => {
    const updated = { ...MORGAN, roles: ['employee', 'finance'] };
    const api = { updateRoles: jest.fn().mockResolvedValue(updated) };
    initUsersApp(document, [PRIYA, MORGAN], api, VIEWER);
    document.querySelectorAll('#user-tbody tr')[1].querySelector('[data-action="edit"]').click();
    expect(document.getElementById('user-modal-title').textContent).toBe('Edit roles');
    expect(document.querySelector('#role-checklist input[value="employee"]').checked).toBe(true);
    expect(document.querySelector('#role-checklist input[value="finance"]').checked).toBe(false);
    checkRole('finance');
    submit('user-form');
    await flush();
    expect(api.updateRoles).toHaveBeenCalledWith('usr_002', ['finance', 'employee']);
    expect(document.querySelectorAll('#user-tbody tr')[1].textContent).toContain('Finance');
    expect(document.getElementById('user-modal-wrap').hidden).toBe(true);
  });

  test('AC3: unchecking every role while editing is blocked with the same inline error', () => {
    const api = { updateRoles: jest.fn() };
    initUsersApp(document, [PRIYA, MORGAN], api, VIEWER);
    document.querySelectorAll('#user-tbody tr')[1].querySelector('[data-action="edit"]').click();
    document.querySelector('#role-checklist input[value="employee"]').checked = false;
    submit('user-form');
    expect(document.getElementById('roles-error').hidden).toBe(false);
    expect(api.updateRoles).not.toHaveBeenCalled();
  });

  test('AC7: Deactivate asks for confirmation naming the consequence, then flips the row to Deactivated', async () => {
    const api = { deactivate: jest.fn().mockResolvedValue({ ...MORGAN, status: 'deactivated' }) };
    initUsersApp(document, [PRIYA, MORGAN], api, VIEWER);
    document.querySelectorAll('#user-tbody tr')[1].querySelector('[data-action="toggle-status"]').click();
    expect(document.getElementById('deactivate-modal-wrap').hidden).toBe(false);
    expect(document.getElementById('deactivate-modal-body').textContent).toContain('read-only history');
    expect(api.deactivate).not.toHaveBeenCalled();
    document.getElementById('deactivate-confirm-btn').click();
    await flush();
    expect(api.deactivate).toHaveBeenCalledWith('usr_002');
    const row = document.querySelectorAll('#user-tbody tr')[1];
    expect(row.querySelector('.status-chip--deactivated')).not.toBeNull();
    expect(row.textContent).toContain('Reactivate');
    expect(document.getElementById('deactivate-modal-wrap').hidden).toBe(true);
  });

  test('cancelling the deactivate confirmation makes no api call', () => {
    const api = { deactivate: jest.fn() };
    initUsersApp(document, [PRIYA, MORGAN], api, VIEWER);
    document.querySelectorAll('#user-tbody tr')[1].querySelector('[data-action="toggle-status"]').click();
    document.getElementById('deactivate-cancel-btn').click();
    expect(document.getElementById('deactivate-modal-wrap').hidden).toBe(true);
    expect(api.deactivate).not.toHaveBeenCalled();
  });

  test('Reactivate calls the api and flips the row back to Active', async () => {
    const api = { reactivate: jest.fn().mockResolvedValue({ ...ELENA, status: 'active' }) };
    initUsersApp(document, [PRIYA, ELENA], api, VIEWER);
    document.querySelectorAll('#user-tbody tr')[1].querySelector('[data-action="toggle-status"]').click();
    await flush();
    expect(api.reactivate).toHaveBeenCalledWith('usr_004');
    expect(document.querySelectorAll('#user-tbody tr')[1].querySelector('.status-chip--active')).not.toBeNull();
  });

  test('search filters by name or email across all statuses and shows the empty state', () => {
    initUsersApp(document, [PRIYA, MORGAN, ELENA], {}, VIEWER);
    const search = document.getElementById('user-search-input');
    search.value = 'elena';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#user-tbody tr')).toHaveLength(1);
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    expect(document.getElementById('um-empty').hidden).toBe(false);
    expect(document.querySelector('#um-empty .empty-query').textContent).toBe('zzz');
  });

  test('user-supplied names are HTML-escaped in the table', () => {
    initUsersApp(document, [PRIYA, fixtureUser({ id: 'usr_x', name: '<img src=x onerror=alert(1)>', email: 'x@company.com', roles: ['employee'] })], {}, VIEWER);
    expect(document.querySelector('#user-tbody img')).toBeNull();
  });

  test('createDefaultApi authenticates every request with the session token, never a client-chosen user id', async () => {
    const { createDefaultApi } = require('../public/js/users');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    const api = createDefaultApi(() => 'fake-session-token');
    await api.list();
    await api.updateRoles('usr_002', ['employee']);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer fake-session-token');
    expect(global.fetch.mock.calls[0][1].headers['x-user-id']).toBeUndefined();
    expect(global.fetch.mock.calls[1][0]).toBe('/users/usr_002/roles');
    expect(global.fetch.mock.calls[1][1].method).toBe('PATCH');
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fake-session-token');
    delete global.fetch;
  });
});
