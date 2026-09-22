const express = require('express');
const employeesRouter = require('./employees/routes');

const app = express();
app.use(express.json());
app.use('/employees', employeesRouter);

module.exports = app;
