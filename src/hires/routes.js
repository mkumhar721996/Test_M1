const express = require('express');
const { createHire, getHire, updateHire, deactivateHire, reactivateHire } = require('./store');

const router = express.Router();

router.post('/', async (req, res) => {
  const hire = await createHire(req.body);
  res.status(201).json(hire);
});

router.get('/:id', (req, res) => {
  const hire = getHire(req.params.id);
  if (!hire) {
    return res.status(404).json({ error: 'hire not found' });
  }
  res.status(200).json(hire);
});

router.patch('/:id', async (req, res) => {
  const hire = await updateHire(req.params.id, req.body);
  if (!hire) {
    return res.status(404).json({ error: 'hire not found' });
  }
  res.status(200).json(hire);
});

router.post('/:id/deactivate', async (req, res) => {
  const hire = await deactivateHire(req.params.id);
  if (!hire) {
    return res.status(404).json({ error: 'hire not found' });
  }
  res.status(200).json(hire);
});

router.post('/:id/reactivate', async (req, res) => {
  const hire = await reactivateHire(req.params.id);
  if (!hire) {
    return res.status(404).json({ error: 'hire not found' });
  }
  res.status(200).json(hire);
});

module.exports = router;
