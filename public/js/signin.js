const ROLE_LABELS = { admin: 'Admin', finance: 'Finance', employee: 'Employee' };

const SESSION_KEY = 'session';

function createDefaultApi() {
  return {
    signIn: (email, password) => fetch('/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then((res) => res.json().then((json) => {
      if (!res.ok) return Promise.reject({ status: res.status, body: json });
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(json));
      return json;
    })),
    signOut: () => {
      let token = null;
      try { token = JSON.parse(window.sessionStorage.getItem(SESSION_KEY)).token; } catch (e) { /* no session */ }
      window.sessionStorage.removeItem(SESSION_KEY);
      return token ? fetch('/auth/sign-out', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve();
    },
  };
}

function initSigninApp(doc, api) {
  const form = doc.getElementById('signin-form');
  const errorBanner = doc.getElementById('signin-error');
  const errorText = doc.getElementById('signin-error-text');
  const success = doc.getElementById('signin-success');
  const emailInput = doc.getElementById('signin-email');
  const passwordInput = doc.getElementById('signin-password');
  const submitBtn = doc.getElementById('signin-submit-btn');

  doc.querySelectorAll('.try-as-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      emailInput.value = chip.getAttribute('data-try');
      passwordInput.focus();
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorBanner.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    api.signIn(emailInput.value.trim(), passwordInput.value).then((user) => {
      form.hidden = true;
      success.hidden = false;
      doc.getElementById('signin-success-name').textContent = `Signed in as ${user.name}`;
      doc.getElementById('signin-success-roles').textContent = `Roles: ${user.roles.map((r) => ROLE_LABELS[r] || r).join(', ')}`;
    }).catch((err) => {
      passwordInput.value = '';
      errorText.textContent = (err && err.body && err.body.message) || 'Sign-in failed — please try again.';
      errorBanner.hidden = false;
    }).then(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    });
  });

  doc.getElementById('signin-reset-btn').addEventListener('click', () => {
    api.signOut();
    form.hidden = false;
    success.hidden = true;
    errorBanner.hidden = true;
    emailInput.value = '';
    passwordInput.value = '';
    emailInput.focus();
  });
}

if (typeof module !== 'undefined') {
  module.exports = { initSigninApp, createDefaultApi };
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initSigninApp(document, createDefaultApi()));
}
