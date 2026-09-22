import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fireEvent } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLoginForm } from '../login-form.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');

beforeEach(() => {
  document.documentElement.innerHTML = indexHtml;
});

describe('AC1: login page load state', () => {
  it('shows an email/username field, a password field, and a submit action', () => {
    expect(document.getElementById('login-email')).not.toBeNull();
    expect(document.getElementById('login-password').type).toBe('password');
    const submit = document.getElementById('submit-btn');
    expect(submit.type).toBe('submit');
    expect(submit.textContent.trim()).toBe('Sign in');
  });
});

describe('AC2: empty-field validation', () => {
  it('shows an email error and preserves the password when email is left empty', () => {
    initLoginForm(document, window);
    document.getElementById('login-password').value = 'test-password';
    fireEvent.submit(document.getElementById('login-form'));

    expect(document.getElementById('email-error').classList.contains('is-visible')).toBe(true);
    expect(document.getElementById('password-error').classList.contains('is-visible')).toBe(false);
    expect(document.getElementById('login-password').value).toBe('test-password');
  });

  it('shows a password error and preserves the email when password is left empty', () => {
    initLoginForm(document, window);
    document.getElementById('login-email').value = 'avery.chen@example.com';
    fireEvent.submit(document.getElementById('login-form'));

    expect(document.getElementById('password-error').classList.contains('is-visible')).toBe(true);
    expect(document.getElementById('email-error').classList.contains('is-visible')).toBe(false);
    expect(document.getElementById('login-email').value).toBe('avery.chen@example.com');
  });
});

describe('AC3/AC4: invalid credentials', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an invalid-credentials banner error', async () => {
    vi.useFakeTimers();
    initLoginForm(document, window);
    document.getElementById('login-email').value = 'wrong.person@example.com';
    document.getElementById('login-password').value = 'not-the-right-password';
    fireEvent.submit(document.getElementById('login-form'));
    await vi.advanceTimersByTimeAsync(350);

    expect(document.getElementById('banner-error').classList.contains('is-visible')).toBe(true);
    expect(document.getElementById('banner-error-text').textContent).toBe(
      'The email/username or password you entered is incorrect.'
    );
  });

  it('keeps the user on the login page (no redirect)', async () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    const win = { setTimeout: window.setTimeout.bind(window), location: { assign } };
    initLoginForm(document, win);
    document.getElementById('login-email').value = 'wrong.person@example.com';
    document.getElementById('login-password').value = 'not-the-right-password';
    fireEvent.submit(document.getElementById('login-form'));
    await vi.advanceTimersByTimeAsync(1000);

    expect(assign).not.toHaveBeenCalled();
  });
});

describe('AC5: valid credentials redirect', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('redirects away from the login page', async () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    const win = { setTimeout: window.setTimeout.bind(window), location: { assign } };
    initLoginForm(document, win);
    document.getElementById('login-email').value = 'avery.chen@example.com';
    document.getElementById('login-password').value = 'test-password';
    fireEvent.submit(document.getElementById('login-form'));
    await vi.advanceTimersByTimeAsync(850);

    expect(assign).toHaveBeenCalledWith('/account/index.html');
  });
});
