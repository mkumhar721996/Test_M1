const GENERIC_ERROR = 'Sign-in could not be completed — please try again.';

function roleLabel(role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function initSigninApp(doc, api) {
  const form = doc.getElementById('signin-form');
  const errorBox = doc.getElementById('signin-error');
  const errorText = doc.getElementById('signin-error-text');
  const success = doc.getElementById('signin-success');
  const emailInput = doc.getElementById('signin-email');
  const passwordInput = doc.getElementById('signin-password');
  const submitBtn = doc.getElementById('signin-submit-btn');

  function showError(message) {
    passwordInput.value = '';
    errorText.textContent = message;
    errorBox.hidden = false;
    form.hidden = false;
    success.hidden = true;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    api.signIn(emailInput.value.trim(), passwordInput.value).then(({ token, ...user }) => {
      doc.defaultView.sessionStorage.setItem('session', JSON.stringify({ token, user }));
      form.hidden = true;
      success.hidden = false;
      doc.getElementById('signin-success-name').textContent = `Signed in as ${user.name}`;
      doc.getElementById('signin-success-roles').textContent = `Roles: ${user.roles.map(roleLabel).join(', ')}`;
    }).catch((err) => {
      const body = (err && err.body) || {};
      const fields = body.fields || {};
      showError(body.message || fields.email || fields.password || GENERIC_ERROR);
    }).then(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    });
  });

  doc.getElementById('signin-reset-btn').addEventListener('click', () => {
    const storage = doc.defaultView.sessionStorage;
    const session = JSON.parse(storage.getItem('session') || 'null');
    storage.removeItem('session');
    if (session) api.signOut(session.token).catch(() => {});
    form.hidden = false;
    success.hidden = true;
    errorBox.hidden = true;
    emailInput.value = '';
    passwordInput.value = '';
    emailInput.focus();
  });
}

function createDefaultApi() {
  return {
    signIn: (email, password) => fetch('/users/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then((res) => res.json().then((json) => {
      if (!res.ok) return Promise.reject({ status: res.status, body: json });
      return json;
    })),
    signOut: (token) => fetch('/users/sign-out', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),
  };
}

module.exports = { initSigninApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initSigninApp(document, createDefaultApi());
  });
}
