// Fixture account for this stub login flow (no backend/session handling in scope).
// The password is never stored or compared in plaintext — only its SHA-256 digest is kept.
const VALID_ACCOUNT_EMAIL = 'avery.chen@example.com';
const VALID_PASSWORD_DIGEST = 'c638833f69bbfb3c267afa0a74434812436b8f08a81fd263c6be6871de4f1265';

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function validate({ email, password }) {
  return {
    emailError: email.trim() === '' ? 'Enter your email or username.' : null,
    passwordError: password === '' ? 'Enter your password.' : null,
  };
}

export async function checkCredentials({ email, password }) {
  const digest = await sha256Hex(password);
  return email.trim() === VALID_ACCOUNT_EMAIL && digest === VALID_PASSWORD_DIGEST;
}
