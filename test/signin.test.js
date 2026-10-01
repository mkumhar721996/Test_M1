const request = require('supertest');
const { app, SEED_EMAIL, SEED_PASSWORD, bearer, adminToken, createAccount, uniqueEmail } = require('./helpers/users-auth');

const DEACTIVATED_MESSAGE = 'This account has been deactivated. Contact an administrator for access.';

function signIn(body) {
  return request(app).post('/users/sign-in').send(body);
}

async function newAccount(prefix) {
  const email = uniqueEmail(prefix);
  const res = await createAccount({ name: 'Sign In Person', email, roles: ['employee'] });
  return { email, id: res.body.id, password: res.body.temporaryPassword };
}

test('AC4: a newly created active account signs in with its temporary password, without any prior session', async () => {
  const { email, password } = await newAccount('signin.jordan');
  const res = await signIn({ email, password });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ email, roles: ['employee'], name: 'Sign In Person' });
  expect(res.body.id).toBeTruthy();
  expect(res.body.token).toBeTruthy();
  expect(res.body).not.toHaveProperty('passwordHash');
});

test('AC4: sign-in matches the email case-insensitively', async () => {
  const { email, password } = await newAccount('signin.case');
  const res = await signIn({ email: email.toUpperCase(), password });
  expect(res.status).toBe(200);
});

test('the seeded admin signs in with the configured seed password', async () => {
  const res = await signIn({ email: SEED_EMAIL, password: SEED_PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body.roles).toEqual(['admin', 'finance']);
});

test('a wrong password is rejected with 401 and no token', async () => {
  const { email } = await newAccount('signin.wrong');
  const res = await signIn({ email, password: 'not-the-password' });
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('invalid_credentials');
  expect(res.body.token).toBeUndefined();
});

test('an unknown email and a wrong password produce an identical response', async () => {
  const { email } = await newAccount('signin.same');
  const wrong = await signIn({ email, password: 'not-the-password' });
  const unknown = await signIn({ email: 'nobody@company.com', password: 'not-the-password' });
  expect(unknown.status).toBe(wrong.status);
  expect(unknown.body).toEqual(wrong.body);
});

test('AC7: a deactivated account cannot sign in, and is told so only with the correct password', async () => {
  const { email, id, password } = await newAccount('signin.elena');
  await request(app).post(`/users/${id}/deactivate`).set(bearer(await adminToken()));
  const res = await signIn({ email, password });
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'account_deactivated', message: DEACTIVATED_MESSAGE });
  const wrong = await signIn({ email, password: 'not-the-password' });
  expect(wrong.status).toBe(401);
  expect(wrong.body.error).toBe('invalid_credentials');
});

test('AC7: once reactivated the account can sign in again', async () => {
  const { email, id, password } = await newAccount('signin.react');
  const admin = bearer(await adminToken());
  await request(app).post(`/users/${id}/deactivate`).set(admin);
  await request(app).post(`/users/${id}/reactivate`).set(admin);
  expect((await signIn({ email, password })).status).toBe(200);
});

test('a missing email or password is rejected with 400', async () => {
  const noPassword = await signIn({ email: SEED_EMAIL });
  const noEmail = await signIn({ password: 'test-password' });
  expect(noPassword.status).toBe(400);
  expect(noPassword.body.fields.password).toBeTruthy();
  expect(noEmail.status).toBe(400);
  expect(noEmail.body.fields.email).toBeTruthy();
});
