const path = require('path');
const express = require('express');
const employeesRouter = require('./employees/routes');
const workflowsRouter = require('./workflows/routes');
const runsRouter = require('./runs/routes');
const hiresRouter = require('./hires/routes');
const auditLogRouter = require('./runs/auditLogRoutes');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/design-system', express.static(path.join(__dirname, '..', 'design-system')));
app.use('/employees', employeesRouter);
app.use('/workflows', workflowsRouter);
app.use('/runs', runsRouter);
app.use('/hires', hiresRouter);
app.use('/audit-log', auditLogRouter);

app.use((err, req, res, next) => {
  res.status(500).json({ error: 'internal server error' });
});

module.exports = app;
