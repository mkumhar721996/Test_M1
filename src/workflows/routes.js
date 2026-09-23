const express = require('express');
const { createWorkflow } = require('./store');

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const workflow = createWorkflow(req.body);
    res.status(201).json(workflow);
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

module.exports = router;
