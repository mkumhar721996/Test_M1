/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'signin.html');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function submitForm() {
  document.getElementById('signin-form').dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('Sign-in UI', () => {
  let initSigninApp;

  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    ({ initSigninApp } = require('../public/js/signin'));
  });

  test('AC4: a successful sign-in hides the form and shows the signed-in name and roles', async () => {
    const api = { signIn: jest.fn().mockResolvedValue({ id: 'usr_001', name: 'Priya Shah', email: 'priya.shah@company.com', roles: ['admin', 'finance'] }) };
    initSigninApp(document, api);
    document.getElementById('signin-email').value = ' priya.shah@company.com ';
    document.getElementById('signin-password').value = 'test-password';
    submitForm();
    await flush();
    expect(api.signIn).toHaveBeenCalledWith('priya.shah@company.com', 'test-password');
    expect(document.getElementById('signin-form').hidden).toBe(true);
    expect(document.getElementById('signin-success').hidden).toBe(false);
    expect(document.getElementById('signin-success-name').textContent).toBe('Signed in as Priya Shah');
    expect(document.getElementById('signin-success-roles').textContent).toBe('Roles: Admin, Finance');
  });

  test('AC7: a deactivated account shows the server message, clears only the password, and keeps the form', async () => {
    const message = 'This account has been deactivated. Contact an administrator for access.';
    const api = { signIn: jest.fn().mockRejectedValue({ status: 403, body: { error: 'account_deactivated', message } }) };
    initSigninApp(document, api);
    document.getElementById('signin-email').value = 'elena.brooks@company.com';
    document.getElementById('signin-password').value = 'test-password';
    submitForm();
    await flush();
    expect(document.getElementById('signin-error').hidden).toBe(false);
    expect(document.getElementById('signin-error-text').textContent).toBe(message);
    expect(document.getElementById('signin-password').value).toBe('');
    expect(document.getElementById('signin-email').value).toBe('elena.brooks@company.com');
    expect(document.getElementById('signin-form').hidden).toBe(false);
    expect(document.getElementById('signin-success').hidden).toBe(true);
  });

  test('invalid credentials show the generic server message', async () => {
    const api = { signIn: jest.fn().mockRejectedValue({ status: 401, body: { error: 'invalid_credentials', message: 'Incorrect email or password.' } }) };
    initSigninApp(document, api);
    submitForm();
    await flush();
    expect(document.getElementById('signin-error-text').textContent).toBe('Incorrect email or password.');
  });

  test('"Try a sample account" chips fill the email only and never prefill a password', () => {
    initSigninApp(document, { signIn: jest.fn() });
    document.getElementById('signin-password').value = '';
    document.querySelector('[data-try="elena.brooks@company.com"]').click();
    expect(document.getElementById('signin-email').value).toBe('elena.brooks@company.com');
    expect(document.getElementById('signin-password').value).toBe('');
  });

  test('createDefaultApi stores the session on sign-in and revokes it on sign-out', async () => {
    const { createDefaultApi } = require('../public/js/signin');
    const body = { id: 'u', name: 'Priya Shah', email: 'p@company.com', roles: ['admin'], token: 'fake-session-token' };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
    const api = createDefaultApi();
    await api.signIn('p@company.com', 'test-password');
    expect(JSON.parse(sessionStorage.getItem('session')).token).toBe('fake-session-token');
    await api.signOut();
    expect(sessionStorage.getItem('session')).toBeNull();
    const [url, opts] = global.fetch.mock.calls[1];
    expect(url).toBe('/auth/sign-out');
    expect(opts.headers.Authorization).toBe('Bearer fake-session-token');
    delete global.fetch;
  });

  test('"Sign out / try another account" restores the empty form', async () => {
    const api = { signIn: jest.fn().mockResolvedValue({ id: 'u', name: 'Priya Shah', email: 'p@company.com', roles: ['admin'] }), signOut: jest.fn() };
    initSigninApp(document, api);
    submitForm();
    await flush();
    document.getElementById('signin-reset-btn').click();
    expect(api.signOut).toHaveBeenCalled();
    expect(document.getElementById('signin-form').hidden).toBe(false);
    expect(document.getElementById('signin-success').hidden).toBe(true);
    expect(document.getElementById('signin-email').value).toBe('');
  });
});
