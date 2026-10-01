const express = require('express');
const usersStore = require('./store');
const sessions = require('./sessions');
const { UserValidationError } = usersStore;

const router = express.Router();

const CREATABLE_FIELDS = ['name', 'email', 'roles'];

const DENIED_MESSAGE =
  'User & role management is limited to Admin and Finance accounts. Ask an administrator for the Admin or Finance role.';
const DEACTIVATED_MESSAGE = 'This account has been deactivated. Contact an administrator for access.';

function pickFields(body, fields) {
  return fields.reduce((picked, field) => {
    if (body && field in body) picked[field] = body[field];
    return picked;
  }, {});
}

function requireManager(req, res, next) {
  const caller = sessions.authenticatedUser(req);
  if (!caller) {
    return res.status(401).json({ error: 'unauthorized', message: 'Sign in to continue.' });
  }
  if (!usersStore.canManageUsers(caller.roles)) {
    return res.status(403).json({ error: 'forbidden', message: DENIED_MESSAGE });
  }
  next();
}

function respondWith(res, next, action, successStatus = 200) {
  try {
    const result = action();
    if (!result) {
      return res.status(404).json({ error: 'user not found' });
    }
    res.status(successStatus).json(result);
  } catch (err) {
    if (err instanceof UserValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
}

router.post('/sign-in', (req, res) => {
  const { email, password } = req.body || {};
  const fields = {};
  if (!email) fields.email = 'Enter your work email.';
  if (!password) fields.password = 'Enter your password.';
  if (Object.keys(fields).length > 0) {
    return res.status(400).json({ error: 'validation_error', fields });
  }

  const result = usersStore.authenticate(email, password);
  if (!result.ok && result.reason === 'deactivated') {
    return res.status(403).json({ error: 'account_deactivated', message: DEACTIVATED_MESSAGE });
  }
  if (!result.ok) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Incorrect email or password.' });
  }
  const { id, name, roles } = result.user;
  res.status(200).json({ id, name, email: result.user.email, roles, token: sessions.createSession(id) });
});

router.post('/sign-out', (req, res) => {
  const token = sessions.tokenFromRequest(req);
  if (token) sessions.destroySession(token);
  res.status(204).end();
});

router.use(requireManager);

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(usersStore.listUsers());
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  respondWith(res, next, () => usersStore.createUser(pickFields(req.body, CREATABLE_FIELDS)), 201);
});

router.patch('/:id/roles', (req, res, next) => {
  respondWith(res, next, () => usersStore.setUserRoles(req.params.id, (req.body || {}).roles));
});

router.post('/:id/deactivate', (req, res, next) => {
  respondWith(res, next, () => usersStore.deactivateUser(req.params.id));
});

router.post('/:id/reactivate', (req, res, next) => {
  respondWith(res, next, () => usersStore.reactivateUser(req.params.id));
});

module.exports = router;
