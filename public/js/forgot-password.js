const { escapeHtml } = require('./utils');

const PASSWORD_RULES = {
  len: (v) => v.length >= 8,
  upper: (v) => /[A-Z]/.test(v),
  lower: (v) => /[a-z]/.test(v),
  num: (v) => /[0-9]/.test(v),
  special: (v) => /[!@#$%^&*]/.test(v),
};

function passwordMeetsComplexity(password) {
  return Object.values(PASSWORD_RULES).every((rule) => rule(password));
}

function detectChannel(contact) {
  return contact.includes('@') ? 'email' : 'phone';
}

function initForgotPasswordApp(doc, api, options = {}) {
  const navigate = options.navigate || ((url) => { window.location.href = url; });
  const search = options.initialSearch || '';

  const screens = Array.from(doc.querySelectorAll('.screen'));
  function showScreen(name) {
    screens.forEach((s) => { s.hidden = s.dataset.name !== name; });
  }

  const state = { contact: '', channel: 'email', credential: null };

  const fpContact = doc.getElementById('fp-contact');
  const fpSubmitBtn = doc.getElementById('fp-submit-btn');
  const fpBackBtn = doc.getElementById('fp-back-btn');

  const confirmChannelNoun = doc.getElementById('confirm-channel-noun');
  const confirmContact = doc.getElementById('confirm-contact');
  const confirmMessage = doc.getElementById('confirm-message');
  const confirmContinueBtn = doc.getElementById('confirm-continue-btn');
  const confirmResendBtn = doc.getElementById('confirm-resend-btn');
  const confirmBackBtn = doc.getElementById('confirm-back-btn');
  const otpContact = doc.getElementById('otp-contact');

  const otpInput = doc.getElementById('otp-input');
  const otpVerifyBtn = doc.getElementById('otp-verify-btn');
  const otpResendBtn = doc.getElementById('otp-resend-btn');
  const otpBackBtn = doc.getElementById('otp-back-btn');

  const errorRetryBtn = doc.getElementById('error-retry-btn');
  const errorBackBtn = doc.getElementById('error-back-btn');

  const pwNew = doc.getElementById('pw-new');
  const pwConfirm = doc.getElementById('pw-confirm');
  const pwSubmitBtn = doc.getElementById('pw-submit-btn');
  const pwNewError = doc.getElementById('pw-new-error');
  const pwConfirmError = doc.getElementById('pw-confirm-error');
  const pwBackBtn = doc.getElementById('pw-back-btn');

  const successSigninBtn = doc.getElementById('success-signin-btn');
  const successCountdown = doc.getElementById('success-countdown');

  function renderConfirmScreen() {
    const isEmail = state.channel === 'email';
    confirmChannelNoun.textContent = isEmail ? 'email' : 'phone';
    confirmContact.textContent = state.contact;
    confirmMessage.innerHTML = isEmail
      ? `If this account exists, we've sent a password reset link to <strong>${escapeHtml(doc, state.contact)}</strong>. It expires in 15 minutes and can only be used once.`
      : `If this account exists, we've sent a one-time code by SMS to <strong>${escapeHtml(doc, state.contact)}</strong>. It expires in 10 minutes and can only be used once.`;
    confirmContinueBtn.hidden = isEmail;
    otpContact.textContent = state.contact;
  }

  fpSubmitBtn.addEventListener('click', () => {
    const contact = fpContact.value.trim();
    if (!contact) { fpContact.focus(); return; }

    fpSubmitBtn.disabled = true;
    api.requestReset(contact)
      .then(
        (result) => { state.channel = (result && result.channel) || detectChannel(contact); },
        () => { state.channel = detectChannel(contact); },
      )
      .then(() => {
        state.contact = contact;
        fpSubmitBtn.disabled = false;
        renderConfirmScreen();
        showScreen('confirm');
      });
  });
  fpBackBtn.addEventListener('click', () => navigate('./sign-in.html'));

  confirmContinueBtn.addEventListener('click', () => showScreen('otp'));
  confirmResendBtn.addEventListener('click', () => { api.requestReset(state.contact); });
  confirmBackBtn.addEventListener('click', () => navigate('./sign-in.html'));

  otpInput.addEventListener('input', () => {
    otpInput.value = otpInput.value.replace(/\D/g, '').slice(0, 6);
  });
  otpVerifyBtn.addEventListener('click', () => {
    const code = otpInput.value.trim();
    if (code.length !== 6) { otpInput.focus(); return; }
    otpVerifyBtn.disabled = true;
    verifyAndProceed(code).then(() => { otpVerifyBtn.disabled = false; });
  });
  otpResendBtn.addEventListener('click', () => { api.requestReset(state.contact); });
  otpBackBtn.addEventListener('click', () => navigate('./sign-in.html'));

  errorRetryBtn.addEventListener('click', () => showScreen('request'));
  errorBackBtn.addEventListener('click', () => navigate('./sign-in.html'));

  function verifyAndProceed(credential) {
    return api.verifyCredential(credential).then(
      () => { state.credential = credential; showScreen('set-password'); },
      () => { showScreen('error'); },
    );
  }

  function updateChecklist() {
    const v = pwNew.value;
    Object.keys(PASSWORD_RULES).forEach((key) => {
      const li = doc.querySelector(`#pw-checklist li[data-rule="${key}"]`);
      const met = PASSWORD_RULES[key](v);
      li.classList.toggle('met', met);
      li.querySelector('.mark').textContent = met ? '✓' : '○';
    });
  }
  pwNew.addEventListener('input', () => {
    updateChecklist();
    pwNewError.hidden = true;
    pwNew.classList.remove('has-error');
  });
  pwConfirm.addEventListener('input', () => {
    pwConfirmError.hidden = true;
    pwConfirm.classList.remove('has-error');
  });

  pwSubmitBtn.addEventListener('click', () => {
    const newVal = pwNew.value;
    const confirmVal = pwConfirm.value;
    let hasError = false;

    if (!passwordMeetsComplexity(newVal)) {
      pwNewError.hidden = false;
      pwNew.classList.add('has-error');
      hasError = true;
    }
    if (newVal !== confirmVal || confirmVal === '') {
      pwConfirmError.hidden = false;
      pwConfirm.classList.add('has-error');
      hasError = true;
    }
    if (hasError) return;

    pwSubmitBtn.disabled = true;
    api.resetPassword({ credential: state.credential, newPassword: newVal, confirmPassword: confirmVal }).then(
      () => {
        pwSubmitBtn.disabled = false;
        showScreen('success');
        startSuccessRedirect();
      },
      () => {
        pwSubmitBtn.disabled = false;
        showScreen('error');
      },
    );
  });
  pwBackBtn.addEventListener('click', () => navigate('./sign-in.html'));

  let redirectTimer = null;
  function startSuccessRedirect() {
    let secondsLeft = 3;
    successCountdown.textContent = `Redirecting to sign in in ${secondsLeft}s…`;
    clearInterval(redirectTimer);
    redirectTimer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        clearInterval(redirectTimer);
        navigate('./sign-in.html?resetSuccess=1');
      } else {
        successCountdown.textContent = `Redirecting to sign in in ${secondsLeft}s…`;
      }
    }, 1000);
  }
  successSigninBtn.addEventListener('click', () => {
    clearInterval(redirectTimer);
    navigate('./sign-in.html?resetSuccess=1');
  });

  updateChecklist();

  const params = new URLSearchParams(search);
  const token = params.get('token');
  if (token) {
    verifyAndProceed(token);
  } else {
    showScreen('request');
  }
}

function createDefaultApi() {
  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), data);
      return data;
    });
  }

  return {
    requestReset: (contact) => postJson('/auth/forgot-password', { contact }),
    verifyCredential: (credential) => postJson('/auth/reset/verify', { credential }),
    resetPassword: ({ credential, newPassword, confirmPassword }) =>
      postJson('/auth/reset/confirm', { credential, newPassword, confirmPassword }),
  };
}

module.exports = { initForgotPasswordApp, passwordMeetsComplexity, detectChannel };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initForgotPasswordApp(document, createDefaultApi(), { initialSearch: window.location.search });
  });
}
