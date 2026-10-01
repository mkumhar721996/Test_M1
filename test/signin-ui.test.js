/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'signin.html');
const DEACTIVATED_COPY = 'This account has been deactivated. Contact an administrator for access.';

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function submit(email, password) {
  document.getElementById('signin-email').value = email;
  document.getElementById('signin-password').value = password;
  document.getElementById('signin-form').dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('Sign-in UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC4 UI: a successful sign-in shows the account name and its roles', async () => {
    const api = { signIn: jest.fn().mockResolvedValue({ id: 'usr_100', name: 'Jordan Avery', email: 'jordan.avery@company.com', roles: ['employee', 'finance'], token: 'fake-token' }) };
    const { initSigninApp } = require('../public/js/signin');
    initSigninApp(document, api);
    submit('jordan.avery@company.com', 'test-password');
    await flush();
    expect(api.signIn).toHaveBeenCalledWith('jordan.avery@company.com', 'test-password');
    expect(document.getElementById('signin-success').hidden).toBe(false);
    expect(document.getElementById('signin-form').hidden).toBe(true);
    expect(document.getElementById('signin-success-name').textContent).toBe('Signed in as Jordan Avery');
    expect(document.getElementById('signin-success-roles').textContent).toBe('Roles: Employee, Finance');
  });

  test('a successful sign-in keeps the session in sessionStorage, and never the password', async () => {
    sessionStorage.clear();
    const api = { signIn: jest.fn().mockResolvedValue({ id: 'usr_100', name: 'Jordan Avery', email: 'j@company.com', roles: ['employee'], token: 'fake-token' }) };
    const { initSigninApp } = require('../public/js/signin');
    initSigninApp(document, api);
    submit('j@company.com', 'test-password');
    await flush();
    const stored = JSON.parse(sessionStorage.getItem('session'));
    expect(stored).toEqual({ token: 'fake-token', user: { id: 'usr_100', name: 'Jordan Avery', email: 'j@company.com', roles: ['employee'] } });
    expect(JSON.stringify(sessionStorage)).not.toContain('test-password');
  });

  test('a failed sign-in stores no session', async () => {
    sessionStorage.clear();
    const api = { signIn: jest.fn().mockRejectedValue({ status: 401, body: { error: 'invalid_credentials', message: 'Incorrect email or password.' } }) };
    const { initSigninApp } = require('../public/js/signin');
    initSigninApp(document, api);
    submit('j@company.com', 'test-password');
    await flush();
    expect(sessionStorage.getItem('session')).toBeNull();
  });

  test('AC7 UI: a deactivated account shows the server message, clears the password and keeps the email', async () => {
    const api = { signIn: jest.fn().mockRejectedValue({ status: 403, body: { error: 'account_deactivated', message: DEACTIVATED_COPY } }) };
    const { initSigninApp } = require('../public/js/signin');
    initSigninApp(document, api);
    submit('elena.brooks@company.com', 'test-password');
    await flush();
    expect(document.getElementById('signin-error').hidden).toBe(false);
    expect(document.getElementById('signin-error-text').textContent).toBe(DEACTIVATED_COPY);
    expect(document.getElementById('signin-password').value).toBe('');
    expect(document.getElementById('signin-email').value).toBe('elena.brooks@company.com');
    expect(document.getElementById('signin-success').hidden).toBe(true);
  });

  test('an invalid-credentials response shows its message in the error banner', async () => {
    const api = { signIn: jest.fn().mockRejectedValue({ status: 401, body: { error: 'invalid_credentials', message: 'Incorrect email or password.' } }) };
    const { initSigninApp } = require('../public/js/signin');
    initSigninApp(document, api);
    submit('nobody@company.com', 'test-password');
    await flush();
    expect(document.getElementById('signin-error-text').textContent).toBe('Incorrect email or password.');
  });

  test('a validation response without a message falls back to the field error', async () => {
    const api = { signIn: jest.fn().mockRejectedValue({ status: 400, body: { error: 'validation_error', fields: { password: 'Enter your password.' } } }) };
    const { initSigninApp } = require('../public/js/signin');
    initSigninApp(document, api);
    submit('priya.shah@company.com', '');
    await flush();
    expect(document.getElementById('signin-error-text').textContent).toBe('Enter your password.');
  });

  test('the reset button signs out on the server, drops the stored session and returns to a blank form', async () => {
    sessionStorage.clear();
    const api = {
      signIn: jest.fn().mockResolvedValue({ id: 'usr_100', name: 'Jordan Avery', email: 'j@company.com', roles: ['employee'], token: 'fake-token' }),
      signOut: jest.fn().mockResolvedValue(undefined),
    };
    const { initSigninApp } = require('../public/js/signin');
    initSigninApp(document, api);
    submit('j@company.com', 'test-password');
    await flush();
    document.getElementById('signin-reset-btn').click();
    expect(api.signOut).toHaveBeenCalledWith('fake-token');
    expect(sessionStorage.getItem('session')).toBeNull();
    expect(document.getElementById('signin-form').hidden).toBe(false);
    expect(document.getElementById('signin-success').hidden).toBe(true);
    expect(document.getElementById('signin-email').value).toBe('');
  });
});

describe('createDefaultApi', () => {
  test('posts the credentials as JSON to /users/sign-in and rejects with status and body on failure', async () => {
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({ error: 'account_deactivated' }) });
    const { createDefaultApi } = require('../public/js/signin');
    await expect(createDefaultApi().signIn('a@company.com', 'test-password')).rejects.toEqual({ status: 403, body: { error: 'account_deactivated' } });
    expect(global.fetch.mock.calls[0][0]).toBe('/users/sign-in');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ email: 'a@company.com', password: 'test-password' });
    delete global.fetch;
  });

  test('signOut posts the bearer token to /users/sign-out', async () => {
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const { createDefaultApi } = require('../public/js/signin');
    await createDefaultApi().signOut('fake-token');
    expect(global.fetch.mock.calls[0][0]).toBe('/users/sign-out');
    expect(global.fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer fake-token' } });
    delete global.fetch;
  });
});
