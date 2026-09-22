const express = require('express');
const { createEmployee, getEmployee } = require('./store');

const router = express.Router();

router.post('/', (req, res) => {
  const employee = createEmployee(req.body);
  res.status(201).json(employee);
});

router.get('/:id', (req, res) => {
  const employee = getEmployee(req.params.id);
  if (!employee) {
    return res.status(404).json({ error: 'employee not found' });
  }
  res.status(200).json(employee);
});

module.exports = router;
