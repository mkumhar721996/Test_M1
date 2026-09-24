/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'sign-in.html');

describe('Sign in', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('the post-reset banner is hidden by default', () => {
    const { initSignInApp } = require('../public/js/sign-in');
    initSignInApp(document, '');
    expect(document.getElementById('signin-banner').hidden).toBe(true);
  });

  test('AC10: sign-in shows the post-reset banner when resetSuccess=1 is present', () => {
    const { initSignInApp } = require('../public/js/sign-in');
    initSignInApp(document, '?resetSuccess=1');
    expect(document.getElementById('signin-banner').hidden).toBe(false);
  });

  test('the "Forgot password?" link points to the forgot-password page', () => {
    const link = document.getElementById('go-forgot-btn');
    expect(link.getAttribute('href')).toBe('./forgot-password.html');
  });
});
