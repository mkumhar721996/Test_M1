const express = require('express');
const { createHire, getHire, listHires, updateHire, deactivateHire, reactivateHire } = require('./store');

const router = express.Router();

const PATCHABLE_FIELDS = ['name', 'email', 'phone', 'startDate', 'department', 'role', 'hireStage'];

function pickPatchableFields(body) {
  return PATCHABLE_FIELDS.reduce((changes, field) => {
    if (field in body) changes[field] = body[field];
    return changes;
  }, {});
}

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(listHires());
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const hire = await createHire(req.body);
    res.status(201).json(hire);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const hire = getHire(req.params.id);
    if (!hire) {
      return res.status(404).json({ error: 'hire not found' });
    }
    res.status(200).json(hire);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const hire = await updateHire(req.params.id, pickPatchableFields(req.body));
    if (!hire) {
      return res.status(404).json({ error: 'hire not found' });
    }
    res.status(200).json(hire);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/deactivate', async (req, res, next) => {
  try {
    const hire = await deactivateHire(req.params.id);
    if (!hire) {
      return res.status(404).json({ error: 'hire not found' });
    }
    res.status(200).json(hire);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reactivate', async (req, res, next) => {
  try {
    const hire = await reactivateHire(req.params.id);
    if (!hire) {
      return res.status(404).json({ error: 'hire not found' });
    }
    res.status(200).json(hire);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
