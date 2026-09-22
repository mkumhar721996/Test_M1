const express = require('express');
const employeesRouter = require('./employees/routes');
const categoriesRouter = require('./categories/routes');

const app = express();
app.use(express.json());
app.use('/employees', employeesRouter);
app.use('/categories', categoriesRouter);

module.exports = app;
