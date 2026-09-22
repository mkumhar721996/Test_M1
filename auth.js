export const VALID_ACCOUNT = { email: 'avery.chen@example.com', password: 'Sunshine!42' };

export function validate({ email, password }) {
  return {
    emailError: email.trim() === '' ? 'Enter your email or username.' : null,
    passwordError: password === '' ? 'Enter your password.' : null,
  };
}

export function checkCredentials({ email, password }) {
  return email.trim() === VALID_ACCOUNT.email && password === VALID_ACCOUNT.password;
}
