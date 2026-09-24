/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'forgot-password.html');

function fakeApi(overrides = {}) {
  return {
    requestReset: jest.fn((contact) => Promise.resolve({ channel: contact.includes('@') ? 'email' : 'phone' })),
    verifyCredential: jest.fn().mockResolvedValue({ valid: true }),
    resetPassword: jest.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe('Forgot password', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('AC1: an unknown contact reaches the same confirmation screen as a known one', async () => {
    const { initForgotPasswordApp } = require('../public/js/forgot-password');
    const api = fakeApi();
    initForgotPasswordApp(document, api, {});
    document.getElementById('fp-contact').value = 'unknown@example.com';
    document.getElementById('fp-submit-btn').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector('.screen[data-name="confirm"]').hidden).toBe(false);
  });

  test('AC2: a phone number shows the SMS confirmation and "Continue to enter code"', async () => {
    const { initForgotPasswordApp } = require('../public/js/forgot-password');
    const api = fakeApi();
    initForgotPasswordApp(document, api, {});
    document.getElementById('fp-contact').value = '+1 555 010 0100';
    document.getElementById('fp-submit-btn').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('confirm-channel-noun').textContent).toBe('phone');
    expect(document.getElementById('confirm-continue-btn').hidden).toBe(false);
  });

  test('AC2: an email contact hides "Continue to enter code" (the emailed link itself is the continuation)', async () => {
    const { initForgotPasswordApp } = require('../public/js/forgot-password');
    const api = fakeApi();
    initForgotPasswordApp(document, api, {});
    document.getElementById('fp-contact').value = 'works@example.com';
    document.getElementById('fp-submit-btn').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('confirm-channel-noun').textContent).toBe('email');
    expect(document.getElementById('confirm-continue-btn').hidden).toBe(true);
  });

  test('AC3: a verifying token on load goes straight to Set new password', async () => {
    const { initForgotPasswordApp } = require('../public/js/forgot-password');
    const api = fakeApi({ verifyCredential: jest.fn().mockResolvedValue({ valid: true }) });
    initForgotPasswordApp(document, api, { initialSearch: '?token=abc123' });
    await Promise.resolve();
    await Promise.resolve();
    expect(api.verifyCredential).toHaveBeenCalledWith('abc123');
    expect(document.querySelector('.screen[data-name="set-password"]').hidden).toBe(false);
  });

  test('AC4: a failing token shows the error screen', async () => {
    const { initForgotPasswordApp } = require('../public/js/forgot-password');
    const api = fakeApi({ verifyCredential: jest.fn().mockRejectedValue(Object.assign(new Error(), { code: 'invalid_or_expired' })) });
    initForgotPasswordApp(document, api, { initialSearch: '?token=expired' });
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector('.screen[data-name="error"]').hidden).toBe(false);
  });

  test('AC5: the error screen offers "Request a new reset link" back to the request screen', async () => {
    const { initForgotPasswordApp } = require('../public/js/forgot-password');
    const api = fakeApi({ verifyCredential: jest.fn().mockRejectedValue(new Error('invalid_or_expired')) });
    initForgotPasswordApp(document, api, { initialSearch: '?token=expired' });
    await Promise.resolve();
    await Promise.resolve();
    document.getElementById('error-retry-btn').click();
    expect(document.querySelector('.screen[data-name="request"]').hidden).toBe(false);
  });

  test('AC6: a weak password shows an inline error and preserves the value', async () => {
    const { initForgotPasswordApp } = require('../public/js/forgot-password');
    const api = fakeApi();
    initForgotPasswordApp(document, api, { initialSearch: '?token=abc123' });
    await Promise.resolve();
    await Promise.resolve();
    document.getElementById('pw-new').value = 'weak';
    document.getElementById('pw-confirm').value = 'weak';
    document.getElementById('pw-submit-btn').click();
    expect(document.getElementById('pw-new-error').hidden).toBe(false);
    expect(document.getElementById('pw-new').value).toBe('weak');
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  test('AC7: a mismatched confirmation shows an inline error and blocks submit', async () => {
    const { initForgotPasswordApp } = require('../public/js/forgot-password');
    const api = fakeApi();
    initForgotPasswordApp(document, api, { initialSearch: '?token=abc123' });
    await Promise.resolve();
    await Promise.resolve();
    document.getElementById('pw-new').value = 'GoodPassw0rd!';
    document.getElementById('pw-confirm').value = 'Different1!';
    document.getElementById('pw-submit-btn').click();
    expect(document.getElementById('pw-confirm-error').hidden).toBe(false);
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  test('AC9: a successful submit shows the success screen', async () => {
    const { initForgotPasswordApp } = require('../public/js/forgot-password');
    const api = fakeApi();
    initForgotPasswordApp(document, api, { initialSearch: '?token=abc123' });
    await Promise.resolve();
    await Promise.resolve();
    document.getElementById('pw-new').value = 'GoodPassw0rd!';
    document.getElementById('pw-confirm').value = 'GoodPassw0rd!';
    document.getElementById('pw-submit-btn').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector('.screen[data-name="success"]').hidden).toBe(false);
  });

  test('AC10: the success screen redirects to sign-in with resetSuccess=1', async () => {
    const { initForgotPasswordApp } = require('../public/js/forgot-password');
    const api = fakeApi();
    const navigate = jest.fn();
    initForgotPasswordApp(document, api, { initialSearch: '?token=abc123', navigate });
    await Promise.resolve();
    await Promise.resolve();
    document.getElementById('pw-new').value = 'GoodPassw0rd!';
    document.getElementById('pw-confirm').value = 'GoodPassw0rd!';
    document.getElementById('pw-submit-btn').click();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(3000);
    expect(navigate).toHaveBeenCalledWith('./sign-in.html?resetSuccess=1');
  });
});
