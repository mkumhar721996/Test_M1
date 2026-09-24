const express = require('express');
const { createEmployee, getEmployee } = require('./store');

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const employee = createEmployee(req.body);
    res.status(201).json(employee);
  } catch (err) {
    res.status(500).json({ error: 'failed to persist employee' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const employee = getEmployee(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'employee not found' });
    }
    res.status(200).json(employee);
  } catch (err) {
    res.status(500).json({ error: 'failed to load employee' });
  }
});

module.exports = router;
