process.env.SEED_USER_PASSWORD = 'test-seed-password';

const request = require('supertest');
const app = require('../../src/server');

const SEED_EMAIL = 'priya.shah@company.com';
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD;

let counter = 0;
let cachedAdminToken;

function uniqueEmail(prefix) {
  counter += 1;
  return `${prefix}.${counter}@company.com`;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function signInAs(email, password) {
  const res = await request(app).post('/users/sign-in').send({ email, password });
  return res.body.token;
}

async function adminToken() {
  if (!cachedAdminToken) cachedAdminToken = await signInAs(SEED_EMAIL, SEED_PASSWORD);
  return cachedAdminToken;
}

async function createAccount(body, token) {
  const res = await request(app).post('/users').set(bearer(token || await adminToken())).send(body);
  return res;
}

async function actorWith(roles, prefix = 'actor') {
  const email = uniqueEmail(prefix);
  const created = await createAccount({ name: 'Test Actor', email, roles });
  const token = await signInAs(email, created.body.temporaryPassword);
  return { user: created.body, email, token, password: created.body.temporaryPassword };
}

module.exports = { app, SEED_EMAIL, SEED_PASSWORD, uniqueEmail, bearer, signInAs, adminToken, createAccount, actorWith };
