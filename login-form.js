import { validate, checkCredentials } from './auth.js';

export function initLoginForm(doc = document, win = window) {
  const form = doc.getElementById('login-form');
  const emailInput = doc.getElementById('login-email');
  const passwordInput = doc.getElementById('login-password');
  const emailError = doc.getElementById('email-error');
  const passwordError = doc.getElementById('password-error');
  const bannerError = doc.getElementById('banner-error');
  const submitBtn = doc.getElementById('submit-btn');
  const redirectToast = doc.getElementById('redirect-toast-login');

  function clearErrors() {
    emailError.classList.remove('is-visible');
    passwordError.classList.remove('is-visible');
    bannerError.classList.remove('is-visible');
    emailInput.removeAttribute('aria-invalid');
    passwordInput.removeAttribute('aria-invalid');
  }

  function handleSubmit(email, password) {
    clearErrors();
    redirectToast.classList.remove('is-visible');

    const { emailError: emailErrorMsg, passwordError: passwordErrorMsg } = validate({ email, password });

    let hasFieldError = false;
    if (emailErrorMsg) {
      emailError.classList.add('is-visible');
      emailInput.setAttribute('aria-invalid', 'true');
      hasFieldError = true;
    }
    if (passwordErrorMsg) {
      passwordError.classList.add('is-visible');
      passwordInput.setAttribute('aria-invalid', 'true');
      hasFieldError = true;
    }
    if (hasFieldError) {
      (emailErrorMsg ? emailInput : passwordInput).focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.textContent = 'Signing in…';

    win.setTimeout(() => {
      const isValid = checkCredentials({ email, password });

      if (!isValid) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
        submitBtn.textContent = 'Sign in';
        bannerError.classList.add('is-visible');
        bannerError.focus();
        return;
      }

      redirectToast.classList.add('is-visible');
      win.setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
        submitBtn.textContent = 'Sign in';
        win.location.assign('/account/index.html');
      }, 500);
    }, 350);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmit(emailInput.value, passwordInput.value);
  });
}
