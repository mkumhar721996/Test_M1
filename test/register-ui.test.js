/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'register.html');

let initRegisterApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  ({ initRegisterApp } = require('../public/js/register'));
});

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const $ = (id) => document.getElementById(id);
const submitForm = () => $('register-form').dispatchEvent(new Event('submit', { cancelable: true }));
const confirmScreen = () => document.querySelector('.screen[data-name="Registration confirmed"]');
const makeApi = (over = {}) => ({ createAccount: jest.fn().mockResolvedValue({ id: 'u1' }), ...over });
const fillValid = () => {
  $('reg-name').value = 'Taylor Reed';
  $('reg-email').value = 'taylor.reed@example.com';
  $('reg-password').value = 'test-pass1';
  $('reg-confirm-password').value = 'test-pass1';
  $('reg-terms').checked = true;
};

test('AC2: successful submission shows the Registration successful confirmation', async () => {
  const api = makeApi();
  initRegisterApp(document, api);
  fillValid();
  submitForm();
  await flush();
  expect(api.createAccount).toHaveBeenCalledWith({
    name: 'Taylor Reed', email: 'taylor.reed@example.com', password: 'test-pass1', termsAccepted: true,
  });
  expect(confirmScreen().style.display).not.toBe('none');
  expect($('confirm-name').textContent).toBe('Taylor Reed');
  expect($('confirm-email').textContent).toBe('taylor.reed@example.com');
});

test('invalid submission keeps the user on the form and never shows the confirmation', () => {
  const api = makeApi();
  initRegisterApp(document, api);
  submitForm();
  expect(api.createAccount).not.toHaveBeenCalled();
  expect(confirmScreen().style.display).toBe('none');
  expect($('err-name').hidden).toBe(false);
});

test('mismatched confirm password is flagged and not submitted', () => {
  const api = makeApi();
  initRegisterApp(document, api);
  fillValid();
  $('reg-confirm-password').value = 'other';
  submitForm();
  expect(api.createAccount).not.toHaveBeenCalled();
  expect($('err-confirm-password').hidden).toBe(false);
});

test('duplicate-email response shows the form banner, not the confirmation screen', async () => {
  const api = makeApi({ createAccount: jest.fn().mockRejectedValue({ status: 409, error: 'email_taken' }) });
  initRegisterApp(document, api);
  fillValid();
  submitForm();
  await flush();
  expect($('form-error-banner').hidden).toBe(false);
  expect($('form-error-text').textContent).toMatch(/already exists/);
  expect(confirmScreen().style.display).toBe('none');
  expect($('submit-btn').disabled).toBe(false);
});

test('server field errors are mapped onto the matching field', async () => {
  const api = makeApi({ createAccount: jest.fn().mockRejectedValue({ status: 400, error: 'validation_error', fields: { email: 'bad' } }) });
  initRegisterApp(document, api);
  fillValid();
  submitForm();
  await flush();
  expect($('err-email').hidden).toBe(false);
  expect(confirmScreen().style.display).toBe('none');
});

test('register another account resets the form and returns to it', async () => {
  initRegisterApp(document, makeApi());
  fillValid();
  submitForm();
  await flush();
  $('back-to-form').click();
  expect(confirmScreen().style.display).toBe('none');
  expect($('reg-name').value).toBe('');
});

test('go to sign in shows the scope toast', () => {
  initRegisterApp(document, makeApi());
  $('go-to-signin').click();
  expect($('scope-toast').hidden).toBe(false);
});
