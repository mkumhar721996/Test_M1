const path = require('path');
const express = require('express');
const employeesRouter = require('./employees/routes');
const expensesRouter = require('./expenses/routes');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/design-system', express.static(path.join(__dirname, '..', 'design-system')));
app.use('/employees', employeesRouter);
app.use('/expenses', expensesRouter);

module.exports = app;
