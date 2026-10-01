const express = require('express');
const usersStore = require('./store');
const { authenticatedUser } = require('../auth/sessions');

const router = express.Router();

const CREATABLE_FIELDS = ['name', 'email', 'roles'];

function pickFields(body, fields) {
  return fields.reduce((picked, field) => {
    if (body && field in body) picked[field] = body[field];
    return picked;
  }, {});
}

function denyUnless(req, res, next) {
  const user = authenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!usersStore.canManageUsers(user.roles)) {
    return res.status(403).json({ error: 'forbidden', message: "You don't have permission to manage user accounts" });
  }
  next();
}

function respond(res, next, action, status = 200) {
  try {
    const result = action();
    if (!result) return res.status(404).json({ error: 'user not found' });
    return res.status(status).json(result);
  } catch (err) {
    if (err instanceof usersStore.UserValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    return next(err);
  }
}

router.use(denyUnless);

router.get('/', (req, res) => {
  res.status(200).json(usersStore.listUsers());
});

router.post('/', (req, res, next) => {
  respond(res, next, () => usersStore.createUser(pickFields(req.body, CREATABLE_FIELDS)), 201);
});

router.patch('/:id/roles', (req, res, next) => {
  respond(res, next, () => usersStore.updateRoles(req.params.id, req.body && req.body.roles));
});

router.post('/:id/deactivate', (req, res, next) => {
  respond(res, next, () => usersStore.deactivateUser(req.params.id));
});

router.post('/:id/reactivate', (req, res, next) => {
  respond(res, next, () => usersStore.reactivateUser(req.params.id));
});

module.exports = router;
